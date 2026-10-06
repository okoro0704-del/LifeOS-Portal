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
import {
  ApiError,
  cacheUser,
  getCachedUser,
  portalApi,
} from "../lib/api";

type AuthState = {
  user: PortalUserPublic | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setSession: (user: PortalUserPublic) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // The cookie is invisible to JavaScript; /auth/me (below) is the only source of truth.
  const [user, setUser] = useState<PortalUserPublic | null>(() => getCachedUser());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await portalApi.me();
      cacheUser(data.user);
      setUser(data.user);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.code === "unauthorized")) {
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
    cacheUser(null);
    setUser(null);
  }, []);

  const setSession = useCallback((next: PortalUserPublic) => {
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
