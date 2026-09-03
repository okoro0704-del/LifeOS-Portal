import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PortalUserPublic } from "@lifeos-portal/shared";
import { ApiError, cacheUser, getCachedUser, getStoredSessionToken, portalApi, storeSessionToken } from "../lib/api";

type AuthState = {
  user: PortalUserPublic | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setSession: (sessionToken: string, user: PortalUserPublic) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PortalUserPublic | null>(() =>
    getStoredSessionToken() ? getCachedUser() : null,
  );
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getStoredSessionToken()) {
      cacheUser(null);
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await portalApi.me();
      cacheUser(data.user);
      setUser(data.user);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.code === "unauthorized")) {
        storeSessionToken(null);
        cacheUser(null);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await portalApi.logout().catch(() => undefined);
    storeSessionToken(null);
    cacheUser(null);
    setUser(null);
  }, []);

  const setSession = useCallback((sessionToken: string, next: PortalUserPublic) => {
    storeSessionToken(sessionToken);
    cacheUser(next);
    setUser(next);
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, logout, setSession }),
    [user, loading, refresh, logout, setSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
