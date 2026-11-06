import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, refreshAccessToken, setAccessToken, setLogoutCallback, subscribeAccessToken } from "../api/axios";

export interface AuthUser {
  userId: string;
  email: string;
  hasPassword?: boolean;
  googleLinked?: boolean;
  updatedAt?: string;
  passwordChangedAt?: string | null;
}

export interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  acceptSession: (token: string, profile?: AuthUser) => void;
}

interface AuthResponse {
  accessToken: string;
}

interface JwtPayload {
  userId?: unknown;
  email?: unknown;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getUserFromToken(token: string): AuthUser {
  const payloadSegment = token.split(".")[1];
  if (!payloadSegment) throw new Error("Access token is malformed");

  const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  const payload = JSON.parse(new TextDecoder().decode(bytes)) as JwtPayload;

  if (typeof payload.userId !== "string" || typeof payload.email !== "string") {
    throw new Error("Access token does not contain user identity claims");
  }
  return { userId: payload.userId, email: payload.email };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearAuth = useCallback(() => {
    setAccessToken(null);
    setAccessTokenState(null);
    setUser(null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Clear local auth state even when the server cannot be reached.
    } finally {
      clearAuth();
      if (typeof window !== "undefined") window.location.assign("/login");
    }
  }, [clearAuth]);

  useEffect(() => subscribeAccessToken((token) => {
    if (!token) { setAccessTokenState(null); setUser(null); return; }
    try {
      const identity = getUserFromToken(token);
      setAccessTokenState(token);
      setUser(identity);
    } catch {
      setAccessToken(null);
    }
  }), []);

  useEffect(() => {
    setLogoutCallback(() => {
      clearAuth();
    });
    return () => setLogoutCallback(null);
  }, [clearAuth]);

  useEffect(() => {
    let active = true;
    void refreshAccessToken()
      .then((token) => {
        if (!active) return;
        const nextUser = getUserFromToken(token);
        setAccessToken(token);
        setAccessTokenState(token);
        setUser(nextUser);
      })
      .catch(() => {
        if (active) clearAuth();
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [clearAuth]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.post<AuthResponse>("/auth/login", { email, password });
    const token = response.data.accessToken;
    const nextUser = getUserFromToken(token);
    setAccessToken(token);
    setAccessTokenState(token);
    setUser(nextUser);
  }, []);

  const loginWithGoogle = useCallback(async (credential: string) => {
    const response = await api.post<AuthResponse>("/auth/google", { credential });
    const token = response.data.accessToken;
    const nextUser = getUserFromToken(token);
    setAccessToken(token);
    setAccessTokenState(token);
    setUser(nextUser);
  }, []);

  const acceptSession = useCallback((token: string, profile?: AuthUser) => {
    const identity = getUserFromToken(token);
    setAccessToken(token);
    setAccessTokenState(token);
    setUser({ ...profile, ...identity });
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    await api.post("/auth/signup", { email, password });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, accessToken, isLoading, login, loginWithGoogle, signup, logout, acceptSession }),
    [user, accessToken, isLoading, login, loginWithGoogle, signup, logout, acceptSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
