"use client";

import { useState, useEffect, createContext, useContext, type ReactNode } from "react";
import { type User, authService } from "@/lib/auth";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  loginWithGithub: (usernameHint?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // ⬇️ Pakai IIFE async (bukan await langsung di body useEffect)
    (async () => {
      try {
        const currentUser = await authService.fetchCurrentUser();
        if (mounted) setUser(currentUser);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    // ⬇️ Subscribe perubahan sesi (login/logout/refresh)
    const off = authService.onAuthStateChange((state) => {
      setUser(state.user);
    });

    return () => {
      mounted = false;
      off();
    };
  }, []);

  const loginWithGithub = async (usernameHint?: string) => {
    await authService.loginWithGithub(usernameHint);
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, loginWithGithub, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
