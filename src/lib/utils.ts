import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Compact relative time ("just now", "5m", "3h", "2d", else a short date) for
// chat-list timestamps. `now` is injectable for testing.
export function formatRelativeTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts)
  const min = 60_000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return "just now"
  if (diff < hour) return `${Math.floor(diff / min)}m`
  if (diff < day) return `${Math.floor(diff / hour)}h`
  if (diff < 7 * day) return `${Math.floor(diff / day)}d`
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}
