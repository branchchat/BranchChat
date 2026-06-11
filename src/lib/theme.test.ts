// @vitest-environment jsdom
//
// Theme resolution + application: stored choice wins over system preference,
// setTheme persists and toggles the `.dark` class on <html>.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTheme, setTheme, systemTheme } from "@/lib/theme";

// matchMedia isn't implemented in jsdom — stub it so we can drive the system
// preference per test.
function mockSystemDark(isDark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: isDark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  mockSystemDark(false);
});

describe("theme", () => {
  it("falls back to the system preference when nothing is stored", () => {
    mockSystemDark(true);
    expect(systemTheme()).toBe("dark");
    expect(getTheme()).toBe("dark");

    mockSystemDark(false);
    expect(getTheme()).toBe("light");
  });

  it("prefers an explicit stored choice over the system preference", () => {
    mockSystemDark(true); // system says dark…
    setTheme("light"); // …but the user picked light
    expect(getTheme()).toBe("light");
  });

  it("setTheme persists the choice and toggles the .dark class", () => {
    setTheme("dark");
    expect(localStorage.getItem("branchchat-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    setTheme("light");
    expect(localStorage.getItem("branchchat-theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("ignores a corrupt stored value and uses the system preference", () => {
    localStorage.setItem("branchchat-theme", "neon");
    mockSystemDark(true);
    expect(getTheme()).toBe("dark");
  });
});
