# UI screenshot library

Drop real BranchChat product screenshots here. The pipeline rotates through them
for "show the product" posts (auto-generated cards are used for text/hook posts).

## What to capture (aim for 4–6 to start)

1. **The canvas with a real branching conversation** — several nodes, at least
   one visible fork. This is the money shot. Name: `canvas-branching.png`
2. **Branch compare view** — two endpoints side by side. `branch-compare.png`
3. **A node with tags/comments** or context links. `node-detail.png`
4. **Zoomed-out full tree** — shows scale of an exploration. `full-tree.png`
5. (optional) **Replay / history** or any feature you want to highlight.

## Tips for good shots

- Use real, legible content (a believable research question, not "asdf").
- Clean up clutter; hide anything sensitive.
- Capture at high resolution (retina / 2x if possible). Landscape is fine —
  the publisher will use them as-is or lightly crop.
- Both light and dark mode are welcome; light matches the cards better.

## Naming convention

`<topic>-<short-desc>.png` — e.g. `prompt-compare-3variants.png`.
The pipeline reads filenames to pick a relevant shot, so descriptive names help.
Add a one-line note here per file if the topic isn't obvious from the name:

| File | Best for posts about |
|------|----------------------|
| _(add yours)_ | |

## How it's used

- Draft step: if a post is a "product/feature" angle and a relevant shot exists
  here, the agent attaches it instead of generating a card.
- If no suitable shot exists yet, it falls back to an auto-generated card so the
  post still ships with an image.
