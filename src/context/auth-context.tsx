"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { UserProfile, Subteam } from "@/types";
import { registerDeviceSession, removeCurrentDeviceSession, watchDeviceRevocation } from "@/lib/device-sessions";
import { fetchUser } from "@/lib/core-api";
import { fetchAuthSession, signOutSession, type AuthUser } from "@/lib/auth-api";

interface AuthContextValue {
  authUser: AuthUser | null;
  actualProfile: UserProfile | null;
  profile: UserProfile | null;
  loading: boolean;
  isCoach: boolean;
  isActualCoach: boolean;
  isStudentLeader: boolean;
  isSimulating: boolean;
  refreshSession: () => Promise<AuthUser | null>;
  startSimulation: (uid: string) => void;
  stopSimulation: () => void;
  canManageSubteam: (subteam: Subteam) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [actualProfile, setActualProfile] = useState<UserProfile | null>(null);
  const [simulatedProfile, setSimulatedProfile] = useState<UserProfile | null>(null);
  const [simulationUid, setSimulationUid] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.sessionStorage.getItem("ops-simulation-uid"),
  );
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    const user = await fetchAuthSession();
    setAuthUser(user);
    setAuthLoading(false);
    if (!user) {
      setActualProfile(null);
      setSimulatedProfile(null);
      setSimulationUid(null);
      window.sessionStorage.removeItem("ops-simulation-uid");
      setProfileLoading(false);
    } else {
      setProfileLoading(true);
    }
    return user;
  }, []);

  useEffect(() => { queueMicrotask(() => void refreshSession()); }, [refreshSession]);

  useEffect(() => {
    if (!authUser) return;
    let active = true;
    const load = () => fetchUser(authUser.uid).then((nextProfile) => {
      if (!active) return;
      setActualProfile(nextProfile);
      if (nextProfile?.role !== "coach") {
        setSimulatedProfile(null);
        setSimulationUid(null);
        window.sessionStorage.removeItem("ops-simulation-uid");
      }
      setProfileLoading(false);
    }).catch(() => { if (active) setProfileLoading(false); });
    void load();
    const interval = window.setInterval(load, 60_000);
    window.addEventListener("ops:users-changed", load);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("ops:users-changed", load); };
  }, [authUser]);

  useEffect(() => {
    if (!simulationUid || actualProfile?.role !== "coach") return;
    let active = true;
    fetchUser(simulationUid).then((profile) => { if (active) setSimulatedProfile(profile); }).catch(() => stopSimulation());
    return () => { active = false; };
  }, [actualProfile?.role, simulationUid]);

  const profile = simulationUid ? simulatedProfile : actualProfile;
  const isCoach = profile?.role === "coach";
  const isActualCoach = actualProfile?.role === "coach";
  const isStudentLeader = profile?.role === "student_leader";
  const isSimulating = Boolean(simulationUid && simulatedProfile);

  function canManageSubteam(subteam: Subteam) {
    if (isCoach) return true;
    return isStudentLeader && profile?.subteam === subteam;
  }

  const signOut = useCallback(async () => {
    if (authUser) await removeCurrentDeviceSession(authUser.uid).catch(() => undefined);
    await signOutSession();
    setAuthUser(null);
    setActualProfile(null);
    setSimulatedProfile(null);
    setSimulationUid(null);
    window.sessionStorage.removeItem("ops-simulation-uid");
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    let unsubscribe = () => {};
    let cancelled = false;
    registerDeviceSession(authUser.uid).then((deviceId) => {
      if (!cancelled) unsubscribe = watchDeviceRevocation(authUser.uid, deviceId, () => { void signOut().catch(() => undefined); });
    }).catch(() => undefined);
    return () => { cancelled = true; unsubscribe(); };
  }, [authUser, signOut]);

  function startSimulation(uid: string) {
    if (!isActualCoach || uid === actualProfile?.uid) return;
    setSimulatedProfile(null);
    setSimulationUid(uid);
    window.sessionStorage.setItem("ops-simulation-uid", uid);
  }

  function stopSimulation() {
    setSimulatedProfile(null);
    setSimulationUid(null);
    window.sessionStorage.removeItem("ops-simulation-uid");
  }

  return <AuthContext.Provider value={{ authUser, actualProfile, profile, loading: authLoading || profileLoading || Boolean(simulationUid && !simulatedProfile), isCoach, isActualCoach, isStudentLeader, isSimulating, refreshSession, startSimulation, stopSimulation, canManageSubteam, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
