"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

type Theme =
  | "default"
  | "theme1"
  | "theme2"
  | "theme3"
  | "theme4"
  | "theme5"
  | "theme6"
  | "theme7"
  | "theme8"
  | "theme9"; // 利用可能なベーステーマ
type Mode = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("app-theme") as Theme) || "default";
    }
    return "default";
  });

  const [mode, setModeState] = useState<Mode>(() => {
    const storedMode = localStorage.getItem("app-mode") as Mode;
    if (storedMode) return storedMode;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.setAttribute("data-theme", theme);
    localStorage.setItem("app-theme", theme);
  }, [theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.setAttribute("data-mode", mode);
    localStorage.setItem("app-mode", mode);
  }, [mode]);

  // システムのテーマ変更を関し
  useEffect(() => {
    const mediaQuery = window.matchMedia("'(prefers-color-scheme: dark)");
    const handleChange = () => {
      // ユーザーが明示的にモードを選択していない場合のみシステムに追従
      if (!localStorage.getItem("app-mode-explicitly-set")) {
        setMode(mediaQuery.matches ? "dark" : "light");
      }
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const setMode = (newMode: Mode) => {
    setModeState(newMode);
    localStorage.setItem("app-mode-explicitly-set", "true");
  };

  const toggleMode = () => {
    setMode(mode === "light" ? "dark" : "light");
  };

  return <ThemeContext value={{ theme, setTheme, mode, setMode, toggleMode }}>{children}</ThemeContext>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
