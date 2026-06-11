// Browser smoke test (the todo.md e2e item): load the demo conversation,
// search a phrase across chats, click the result, and assert the matching
// node ends up selected and centered on the canvas. This exercises the real
// React Flow canvas — the part jsdom component tests can't cover.
import { expect, test } from "@playwright/test";

test("demo → search → click result → node selected and centered", async ({
  page,
}) => {
  // /app is account-gated only when a backend is configured; the e2e dev
  // server runs with VITE_API_BASE="" so the gate steps aside.
  await page.goto("/app");

  // The cookie banner floats over the sidebar footer and intercepts clicks;
  // decline it (keeps PostHog off for the test run).
  await page.getByRole("button", { name: "Decline" }).click();

  await page.getByRole("button", { name: "Load demo conversation" }).click();

  // "sake breweries" appears in exactly one demo node, on the NON-active
  // "Food & markets" branch — so the click must actually move the selection.
  const phrase = "sake breweries";
  await page.getByPlaceholder("Search all chats…").fill(phrase);

  const result = page.locator("nav button", { hasText: phrase }).first();
  await expect(result.locator("mark")).toHaveText(phrase);
  await result.click();

  // React Flow marks the selected node wrapper with the `selected` class.
  const selectedNode = page.locator(".react-flow__node.selected");
  await expect(selectedNode).toHaveCount(1);
  await expect(selectedNode).toContainText("Nishiki Market");

  // "Centered": the canvas pans to the node, so its box must be fully inside
  // the viewport and its center near the viewport center (generous tolerance
  // — the sidebar offsets the canvas and the pan animates).
  await page.waitForTimeout(600); // let the setCenter pan settle
  const box = await selectedNode.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) return;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  expect(Math.abs(cx - viewport.width / 2)).toBeLessThan(viewport.width / 4);
  expect(Math.abs(cy - viewport.height / 2)).toBeLessThan(viewport.height / 4);
});
