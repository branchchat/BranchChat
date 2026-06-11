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

  await page.getByRole("button", { name: "Demo: Kyoto trip" }).click();

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

test("long replies clamp on the canvas but open in full via Show more", async ({
  page,
}) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Decline" }).click();
  await page.getByRole("button", { name: "Demo: Kyoto trip" }).click();

  // Center the long day-split reply first (search pans to it at zoom 1 —
  // clicking tiny fit-view-zoomed targets is flaky).
  await page.getByPlaceholder("Search all chats…").fill("Higashiyama");
  await page.locator("nav button", { hasText: "Higashiyama" }).first().click();
  await page.waitForTimeout(600); // let the pan settle

  // That reply is longer than the canvas clamp, so its node must offer
  // "Show more"…
  const node = page.locator(".react-flow__node", { hasText: "Higashiyama" });
  const showMore = node.getByRole("button", { name: "Show more" });
  await expect(showMore).toBeVisible();
  await showMore.click();

  // …which expands the message into a popup with the FULL text (the canvas
  // node only ever shows the first lines).
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("food and markets?");
});

test("nodes can be dragged and keep their new position", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Decline" }).click();
  await page.getByRole("button", { name: "Demo: Kyoto trip" }).click();

  // Center the target node first (the demo tree extends past the viewport,
  // and mouse events can't reach an off-screen node).
  await page.getByPlaceholder("Search all chats…").fill("sake breweries");
  await page.locator("nav button", { hasText: "sake breweries" }).first().click();
  await page.waitForTimeout(600); // let the pan settle

  const node = page.locator(".react-flow__node", { hasText: "Nishiki Market" });
  const before = await node.boundingBox();
  expect(before).not.toBeNull();
  if (!before) return;

  // Drag from the node's header area (the content has nodrag affordances).
  const startX = before.x + before.width / 2;
  const startY = before.y + 12;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 150, startY + 80, { steps: 8 });
  await page.mouse.up();

  const after = await node.boundingBox();
  expect(after).not.toBeNull();
  if (!after) return;
  expect(Math.abs(after.x - before.x)).toBeGreaterThan(100);
  expect(Math.abs(after.y - before.y)).toBeGreaterThan(50);
});

test("dragging between side ports creates a context link; clicking the edge removes it", async ({
  page,
}) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Decline" }).click();
  await page.getByRole("button", { name: "Demo: Kyoto trip" }).click();

  // Center one of the demo's two sibling branch nodes at zoom 1; its sibling
  // sits one layout stride to the right, still inside the viewport. The side
  // ports are ~10px dots — at fit-view zoom they'd be sub-4px drag targets.
  await page.getByPlaceholder("Search all chats…").fill("Focus on temples");
  await page
    .locator("nav button", { hasText: "Focus on temples" })
    .first()
    .click();
  await page.waitForTimeout(600); // let the pan settle

  const source = page.locator(".react-flow__node", {
    hasText: "Focus on temples and gardens.",
  });
  const target = page.locator(".react-flow__node", {
    hasText: "food and markets.",
  });
  const sBox = await source.boundingBox();
  const tBox = await target.boundingBox();
  expect(sBox).not.toBeNull();
  expect(tBox).not.toBeNull();
  if (!sBox || !tBox) return;

  // Drag from the source's RIGHT port to the target's LEFT port (ports sit
  // centered on the node borders).
  await page.mouse.move(sBox.x + sBox.width, sBox.y + sBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(tBox.x, tBox.y + tBox.height / 2, { steps: 10 });
  await page.mouse.up();

  // Context links render as animated (dashed) edges; tree edges don't.
  const linkEdge = page.locator(".react-flow__edge.animated");
  await expect(linkEdge).toHaveCount(1);

  // Clicking the dashed edge unlinks. force: Playwright can't compute
  // visibility for the SVG <g> (stroke-only, no fill); the edge between
  // same-row siblings is straight, so its bbox center lies on the stroke.
  await linkEdge.click({ force: true });
  await expect(linkEdge).toHaveCount(0);
});
