/**
 * Theme system: light / dark / system.
 *
 * - `light` y `dark` son explícitos del usuario
 * - `system` sigue `prefers-color-scheme` del OS y reacciona al cambio
 *
 * El theme efectivo (resolvedTheme) siempre es 'light' | 'dark'.
 * Lo aplicamos como `data-theme` en `<html>` para que CSS lo lea.
 */

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "transparentape-theme";

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  return pref === "system" ? getSystemTheme() : pref;
}

export function readStoredTheme(): ThemePref {
  if (typeof window === "undefined") return "dark";
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "dark";
}

export function writeStoredTheme(pref: ThemePref) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_STORAGE_KEY, pref);
}

/** Aplica el theme resuelto al <html> via data-theme. */
export function applyResolvedTheme(theme: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  // Color scheme nativo del browser (controla scrollbar, form controls)
  document.documentElement.style.colorScheme = theme;
}
