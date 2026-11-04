"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { onAuthStateChanged, signOut as firebaseSignOut, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import type { UserProfile, Subteam } from "@/types";
import { registerDeviceSession, removeCurrentDeviceSession, watchDeviceRevocation } from "@/lib/device-sessions";
import { fetchUser } from "@/lib/core-api";

interface AuthContextValue {
  firebaseUser: User | null;
  actualProfile: UserProfile | null;
  profile: UserProfile | null;
  loading: boolean;
  isCoach: boolean;
  isActualCoach: boolean;
  isStudentLeader: boolean;
  isSimulating: boolean;
  startSimulation: (uid: string) => void;
  stopSimulation: () => void;
  // True for coach, or student leader within their own subteam.
  canManageSubteam: (subteam: Subteam) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [actualProfile, setActualProfile] = useState<UserProfile | null>(null);
  const [simulatedProfile, setSimulatedProfile] = useState<UserProfile | null>(null);
  const [simulationUid, setSimulationUid] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.sessionStorage.getItem("ops-simulation-uid"),
  );
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  // Track Firebase Auth session.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
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
    });
    return unsub;
  }, []);

  // Refresh the D1 profile periodically so role/cert changes made by a coach
  // appear without the student needing to sign in again.
  useEffect(() => {
    if (!firebaseUser) return;
    let active = true;
    const load = () => fetchUser(firebaseUser.uid).then((nextProfile) => {
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
  }, [firebaseUser]);

  // Simulation changes presentation and UI permissions only. API authorization
  // continues to use the real signed-in coach.
  useEffect(() => {
    if (!simulationUid || actualProfile?.role !== "coach") {
      return;
    }
    let active = true;
    fetchUser(simulationUid).then((profile) => { if (active) setSimulatedProfile(profile); }).catch(() => stopSimulation());
    return () => { active = false; };
  }, [actualProfile?.role, simulationUid]);

  useEffect(() => {
    if (!firebaseUser) return;
    let unsubscribe = () => {};
    let cancelled = false;
    registerDeviceSession(firebaseUser.uid).then((deviceId) => {
      if (cancelled) return;
      unsubscribe = watchDeviceRevocation(firebaseUser.uid, deviceId, () => firebaseSignOut(auth));
    }).catch(() => undefined);
    return () => { cancelled = true; unsubscribe(); };
  }, [firebaseUser]);

  const profile = simulationUid ? simulatedProfile : actualProfile;
  const isCoach = profile?.role === "coach";
  const isActualCoach = actualProfile?.role === "coach";
  const isStudentLeader = profile?.role === "student_leader";
  const isSimulating = Boolean(simulationUid && simulatedProfile);

  function canManageSubteam(subteam: Subteam) {
    if (isCoach) return true;
    return isStudentLeader && profile?.subteam === subteam;
  }

  async function signOut() {
    if (firebaseUser) await removeCurrentDeviceSession(firebaseUser.uid);
    await firebaseSignOut(auth);
  }

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

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        actualProfile,
        profile,
        loading: authLoading || profileLoading || Boolean(simulationUid && !simulatedProfile),
        isCoach,
        isActualCoach,
        isStudentLeader,
        isSimulating,
        startSimulation,
        stopSimulation,
        canManageSubteam,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
