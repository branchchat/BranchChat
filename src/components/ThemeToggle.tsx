// Light/dark toggles. Both show the icon of the theme you'd switch TO (a moon
// in light mode, a sun in dark mode), the convention users expect.
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Inline ghost icon button (for headers/toolbars). */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(className)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => setTheme(next)}
    >
      {theme === "dark" ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </Button>
  );
}

/**
 * Full-width labelled row for the /app sidebar footer (matches the Export /
 * Import / demo buttons), so the toggle sits in the app's bottom-left without
 * fighting the canvas zoom controls or sidebar content.
 */
export function ThemeToggleRow({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "w-full justify-start gap-2 text-xs text-muted-foreground",
        className,
      )}
      onClick={() => setTheme(next)}
    >
      {theme === "dark" ? (
        <Sun className="size-3.5" />
      ) : (
        <Moon className="size-3.5" />
      )}
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </Button>
  );
}

/**
 * App-wide floating toggle pinned to the bottom-left corner. Rendered once at
 * the router level so it's visible and reachable on every route — solid
 * (not ghost) so it stands out against the canvas/page.
 */
export function FloatingThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => setTheme(next)}
      className="fixed bottom-4 left-4 z-50 flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {theme === "dark" ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </button>
  );
}
