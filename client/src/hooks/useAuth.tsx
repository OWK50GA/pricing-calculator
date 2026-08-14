import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { authApi } from "@/api/auth";
import { tokenStore } from "@/api/client";

type AuthUser = {
  userId: string;
  role:   string;
};

type AuthContextValue = {
  user:     AuthUser | null;
  isLoading: boolean;
  login:    (email: string, password: string) => Promise<string | null>;
  register: (username: string, email: string, password: string) => Promise<string | null>;
  logout:   () => void;
};

function decodeUser(token: string): AuthUser | null {
  try {
    // JWT payload is base64url encoded in the second segment
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return { userId: payload.userId, role: payload.role };
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]         = useState<AuthUser | null>(null);
  const [isLoading, setLoading] = useState(true);

  // Rehydrate from localStorage on mount
  useEffect(() => {
    const token = tokenStore.getAccess();
    if (token) {
      const decoded = decodeUser(token);
      // If the token is expired, decoded will be stale — the api client
      // will refresh it on the first real request, which is fine.
      setUser(decoded);
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    const { data, error } = await authApi.login({ email, password });
    if (error || !data) return error ?? "Login failed";
    tokenStore.set(data.access_token, data.refresh_token);
    setUser(decodeUser(data.access_token));
    return null;
  }, []);

  const register = useCallback(async (
    username: string,
    email: string,
    password: string,
  ): Promise<string | null> => {
    const { data, error } = await authApi.register({ username, email, password });
    if (error || !data) return error ?? "Registration failed";
    tokenStore.set(data.access_token, data.refresh_token);
    setUser(decodeUser(data.access_token));
    return null;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
