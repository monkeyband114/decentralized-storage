/**
 * Holds the signed-in user for the whole application.
 *
 * The role stored here only controls what the interface shows. Every actual
 * permission decision is made again by the server, so hiding a menu item is a
 * convenience, never the security boundary.
 */
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, getToken, setToken } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On first load, exchange any stored token for the current user record.
  useEffect(() => {
    async function restore() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const data = await api.get("/users/me");
        setUser(data.user);
      } catch {
        setToken(null);
      } finally {
        setLoading(false);
      }
    }
    restore();
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api.post("/auth/login", { email, password });
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const data = await api.post("/auth/register", { name, email, password });
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Even if the call fails, the local session must still be cleared.
    }
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
