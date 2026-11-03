"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { onAuthStateChanged, signOut as firebaseSignOut, User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { UserProfile, Subteam } from "@/types";
import { registerDeviceSession, removeCurrentDeviceSession, watchDeviceRevocation } from "@/lib/device-sessions";

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isCoach: boolean;
  isStudentLeader: boolean;
  // True for coach, or student leader within their own subteam.
  canManageSubteam: (subteam: Subteam) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  // Track Firebase Auth session.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthLoading(false);
      if (!user) {
        setProfile(null);
        setProfileLoading(false);
      } else {
        setProfileLoading(true);
      }
    });
    return unsub;
  }, []);

  // Subscribe to the matching Firestore profile so role/cert changes made
  // by a coach show up live, without the student needing to re-login.
  useEffect(() => {
    if (!firebaseUser) return;
    const ref = doc(db, "users", firebaseUser.uid);
    const unsub = onSnapshot(ref, (snap) => {
      setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      setProfileLoading(false);
    });
    return unsub;
  }, [firebaseUser]);

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

  const isCoach = profile?.role === "coach";
  const isStudentLeader = profile?.role === "student_leader";

  function canManageSubteam(subteam: Subteam) {
    if (isCoach) return true;
    return isStudentLeader && profile?.subteam === subteam;
  }

  async function signOut() {
    if (firebaseUser) await removeCurrentDeviceSession(firebaseUser.uid);
    await firebaseSignOut(auth);
  }

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading: authLoading || profileLoading,
        isCoach,
        isStudentLeader,
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
