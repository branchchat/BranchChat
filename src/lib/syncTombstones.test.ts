// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  addTombstone,
  getTombstones,
  isTombstoned,
  removeTombstone,
} from "@/lib/syncTombstones";

const KEY = "branchchat-sync-tombstones";

beforeEach(() => localStorage.clear());

describe("sync tombstones", () => {
  it("records a deleted id with the version it superseded", () => {
    expect(isTombstoned("c1")).toBe(false);
    addTombstone("c1", 123);
    expect(isTombstoned("c1")).toBe(true);
    expect(getTombstones().c1.v).toBe(123);
  });

  it("removeTombstone forgets a resurrected chat", () => {
    addTombstone("c1", 123);
    removeTombstone("c1");
    expect(isTombstoned("c1")).toBe(false);
  });

  it("prunes entries older than the TTL", () => {
    // An ancient timestamp (1970) is well past the retention window.
    localStorage.setItem(
      KEY,
      JSON.stringify({ old: { ts: 1, v: 1 }, fresh: { ts: Date.now(), v: 5 } }),
    );
    expect(isTombstoned("old")).toBe(false);
    const live = getTombstones();
    expect(live.old).toBeUndefined();
    expect(live.fresh).toBeDefined();
  });

  it("migrates the legacy number shape (deletedAt doubles as the version)", () => {
    const ts = Date.now();
    localStorage.setItem(KEY, JSON.stringify({ legacy: ts }));
    const t = getTombstones().legacy;
    expect(t).toEqual({ ts, v: ts });
  });

  it("tolerates malformed storage", () => {
    localStorage.setItem(KEY, "not json");
    expect(getTombstones()).toEqual({});
  });
});
