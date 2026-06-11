// Light/dark theme state.
//
// The shadcn token set in index.css already ships a full `.dark` palette and a
// `@custom-variant dark (&:is(.dark *))`; all this module does is decide when
// the `.dark` class lives on <html>. An inline script in index.html applies the
// same choice before first paint (no flash) — the logic here must stay in sync
// with that snippet (STORAGE_KEY + meta theme-color values).
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "branchchat-theme";
const CHANGE_EVENT = "branchchat:theme-change";

export type Theme = "light" | "dark";

// Keep these in step with the inline boot script in index.html.
const META_COLOR: Record<Theme, string> = {
  light: "#ffffff",
  dark: "#181818", // matches --background oklch(0.145 0 0)
};

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

/** What the OS/browser prefers when the user hasn't chosen explicitly. */
export function systemTheme(): Theme {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** The theme in effect right now (explicit choice, else system preference). */
export function getTheme(): Theme {
  return readStored() ?? systemTheme();
}

/** Toggle the `.dark` class + browser chrome color to match `theme`. */
function paint(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", META_COLOR[theme]);
}

/** Persist + apply an explicit choice, and notify subscribers. */
export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage unavailable (private mode, etc.) — still apply for this session */
  }
  paint(theme);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  // Cross-tab: a choice made in another tab updates this one.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** React binding: current theme + a setter, reactive to changes in any tab. */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, getTheme, (): Theme => "light");
  return { theme, setTheme };
}
