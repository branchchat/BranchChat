// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { Toolbar } from "@/components/Toolbar";
import { useChatStore } from "@/store/chatStore";

beforeEach(() => {
  localStorage.clear();
});

describe("Toolbar search", () => {
  it("renders matching result cards with the match highlighted", () => {
    // The demo conversation contains "Which one is best at sunrise?".
    useChatStore.getState().loadDemoChat();
    render(<Toolbar />);

    fireEvent.change(screen.getByPlaceholderText(/search all chats/i), {
      target: { value: "sunrise" },
    });

    // A result card references the source chat...
    expect(screen.getAllByText("Demo: Kyoto trip").length).toBeGreaterThan(0);
    // ...and the matched term is wrapped in <mark> by HighlightedSnippet.
    const mark = screen.getByText("sunrise", { selector: "mark" });
    expect(mark.tagName.toLowerCase()).toBe("mark");
  });

  it("shows an empty state when nothing matches", () => {
    useChatStore.getState().loadDemoChat();
    render(<Toolbar />);

    fireEvent.change(screen.getByPlaceholderText(/search all chats/i), {
      target: { value: "zzz-no-such-text" },
    });

    expect(screen.getByText(/No matches/i)).toBeInTheDocument();
  });
});
