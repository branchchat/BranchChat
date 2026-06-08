// Vitest global setup: jest-dom matchers + automatic RTL cleanup after each
// test. Safe to load for node-env tests too (matchers only touch the DOM when
// actually called, and cleanup no-ops without a document).
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
