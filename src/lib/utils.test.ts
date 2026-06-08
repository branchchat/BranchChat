import { describe, expect, it } from "vitest";

import { cn, formatRelativeTime } from "@/lib/utils";

describe("cn", () => {
  it("merges conditional classes and dedupes conflicting Tailwind utilities", () => {
    const hidden = false as boolean;
    expect(cn("px-2", hidden && "hidden", "px-4")).toBe("px-4");
  });
});

describe("formatRelativeTime", () => {
  const now = 1_000_000_000_000;
  const SEC = 1000;
  const MIN = 60 * SEC;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it("shows 'just now' under a minute", () => {
    expect(formatRelativeTime(now - 30 * SEC, now)).toBe("just now");
    expect(formatRelativeTime(now, now)).toBe("just now");
  });

  it("shows minutes, hours, and days", () => {
    expect(formatRelativeTime(now - 5 * MIN, now)).toBe("5m");
    expect(formatRelativeTime(now - 3 * HOUR, now)).toBe("3h");
    expect(formatRelativeTime(now - 2 * DAY, now)).toBe("2d");
    expect(formatRelativeTime(now - 6 * DAY, now)).toBe("6d");
  });

  it("falls back to a short date at a week or older", () => {
    const old = now - 10 * DAY;
    expect(formatRelativeTime(old, now)).toBe(
      new Date(old).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
    );
  });

  it("clamps future timestamps to 'just now'", () => {
    expect(formatRelativeTime(now + 5 * MIN, now)).toBe("just now");
  });
});
