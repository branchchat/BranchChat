// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { readAuthTokenFromUrl } from "./authToken";

describe("readAuthTokenFromUrl", () => {
  it("returns the token and strips it from the address bar", () => {
    window.history.replaceState(null, "", "/verify-email?token=secret123&x=1");
    expect(readAuthTokenFromUrl()).toBe("secret123");
    // The secret is gone from the URL (history/analytics hygiene)…
    expect(window.location.search).toBe("?x=1");
    // …but re-renders (and StrictMode remounts) still see it via the cache.
    expect(readAuthTokenFromUrl()).toBe("secret123");
  });

  it("returns empty when no token is present", () => {
    window.history.replaceState(null, "", "/reset-password");
    expect(readAuthTokenFromUrl()).toBe("");
  });
});
