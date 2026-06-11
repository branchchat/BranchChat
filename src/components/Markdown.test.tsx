// @vitest-environment jsdom
//
// The shared assistant-reply renderer: Markdown structure, GFM, and KaTeX
// math must come out as real elements, not raw symbols.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Markdown } from "@/components/Markdown";

describe("Markdown", () => {
  it("renders bold, lists, and inline code as elements", () => {
    const { container } = render(
      <Markdown>{"**BranchChat**\n\n- one\n- two\n\nUse `npm test`."}</Markdown>,
    );
    expect(screen.getByText("BranchChat").tagName).toBe("STRONG");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByText("npm test").tagName).toBe("CODE");
    // The raw markers must be gone.
    expect(container.textContent).not.toContain("**");
  });

  it("renders fenced code blocks", () => {
    const { container } = render(
      <Markdown>{"```python\nprint('hi')\n```"}</Markdown>,
    );
    const pre = container.querySelector("pre code");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toContain("print('hi')");
  });

  it("renders LaTeX math via KaTeX", () => {
    const { container } = render(<Markdown>{"Euler: $e^{i\\pi} = -1$"}</Markdown>);
    expect(container.querySelector(".katex")).not.toBeNull();
  });
});
