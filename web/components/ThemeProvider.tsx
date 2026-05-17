"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  applyResolvedTheme,
  readStoredTheme,
  resolveTheme,
  type ResolvedTheme,
  type ThemePref,
  writeStoredTheme,
} from "@/lib/theme";

interface ThemeContextValue {
  pref: ThemePref;
  resolved: ResolvedTheme;
  setPref: (p: ThemePref) => void;
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe estar dentro de <ThemeProvider>");
  return ctx;
}

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // En SSR no sabemos el theme; arrancamos 'dark' y corregimos en client mount
  const [pref, setPrefState] = useState<ThemePref>("dark");
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");

  // Hidratar desde localStorage al mount
  useEffect(() => {
    const stored = readStoredTheme();
    setPrefState(stored);
    const r = resolveTheme(stored);
    setResolved(r);
    applyResolvedTheme(r);
  }, []);

  // Si el theme es 'system', escuchar cambios del OS
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const r: ResolvedTheme = mq.matches ? "light" : "dark";
      setResolved(r);
      applyResolvedTheme(r);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    writeStoredTheme(p);
    const r = resolveTheme(p);
    setResolved(r);
    applyResolvedTheme(r);
  };

  // Cycle: dark → light → system → dark
  const cycle = () => {
    const next: ThemePref =
      pref === "dark" ? "light" : pref === "light" ? "system" : "dark";
    setPref(next);
  };

  const value = useMemo(
    () => ({ pref, resolved, setPref, cycle }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pref, resolved]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
