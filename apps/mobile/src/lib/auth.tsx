import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthUser, Role } from "../types";
import { api, clearTokens, loadTokens, logout, saveTokens, setUnauthorizedHandler } from "./api";
import { disconnectSocket } from "./socket";

interface AuthState {
  user: AuthUser | null;
  status: "loading" | "authenticated" | "guest";
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { email: string; password: string; displayName: string; role: Role; acceptedTerms: boolean }) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthResponse = { user: AuthUser; accessToken: string; refreshToken: string };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, status: "loading" });

  const fetchMe = useCallback(async () => {
    const me = await api<AuthUser>("/auth/me");
    setState({ user: me, status: "authenticated" });
  }, []);

  const bootstrap = useCallback(async () => {
    const hasTokens = await loadTokens();
    if (!hasTokens) {
      setState({ user: null, status: "guest" });
      return;
    }
    try {
      await fetchMe();
    } catch {
      await clearTokens();
      setState({ user: null, status: "guest" });
    }
  }, [fetchMe]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      disconnectSocket();
      setState({ user: null, status: "guest" });
    });
    bootstrap();
  }, [bootstrap]);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api<AuthResponse>("/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    });
    await saveTokens(res);
    setState({ user: res.user, status: "authenticated" });
  }, []);

  const signUp = useCallback<AuthContextValue["signUp"]>(async (input) => {
    const res = await api<AuthResponse>("/auth/signup", {
      method: "POST",
      auth: false,
      body: input,
    });
    await saveTokens(res);
    setState({ user: res.user, status: "authenticated" });
  }, []);

  const signOut = useCallback(async () => {
    disconnectSocket();
    await logout();
    setState({ user: null, status: "guest" });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signIn, signUp, signOut, refresh: fetchMe }),
    [state, signIn, signUp, signOut, fetchMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
