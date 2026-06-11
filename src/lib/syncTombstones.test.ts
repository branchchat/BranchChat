// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  addTombstone,
  getTombstones,
  isTombstoned,
} from "@/lib/syncTombstones";

const KEY = "branchchat-sync-tombstones";

beforeEach(() => localStorage.clear());

describe("sync tombstones", () => {
  it("records a deleted id and reports it", () => {
    expect(isTombstoned("c1")).toBe(false);
    addTombstone("c1");
    expect(isTombstoned("c1")).toBe(true);
    expect(Object.keys(getTombstones())).toContain("c1");
  });

  it("prunes entries older than the TTL", () => {
    // An ancient timestamp (1970) is well past the retention window.
    localStorage.setItem(KEY, JSON.stringify({ old: 1, fresh: Date.now() }));
    expect(isTombstoned("old")).toBe(false);
    const live = getTombstones();
    expect(live.old).toBeUndefined();
    expect(live.fresh).toBeDefined();
  });

  it("tolerates malformed storage", () => {
    localStorage.setItem(KEY, "not json");
    expect(getTombstones()).toEqual({});
  });
});
