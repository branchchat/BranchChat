// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { FocusView } from "@/components/FocusView";
import { useChatStore } from "@/store/chatStore";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  useChatStore.getState().closeFocusView();
});

describe("FocusView", () => {
  it("renders nothing while closed", () => {
    const { container } = render(<FocusView />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the selected path as a transcript when open", () => {
    const store = useChatStore.getState();
    store.loadDemoChat();
    store.openFocusView();

    render(<FocusView />);

    // The dialog + chat title.
    expect(
      screen.getByRole("dialog", { name: /focused reading view/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Demo: Kyoto trip")).toBeInTheDocument();

    // Default demo path runs down branch A to the sunrise answer; both the
    // question and the reply on that path should be present...
    expect(screen.getByText(/Which one is best at sunrise/)).toBeInTheDocument();
    expect(screen.getByText(/It opens at 6am/)).toBeInTheDocument();

    // ...while the OTHER branch (food & markets) is not on this path.
    expect(screen.queryByText(/Nishiki Market/)).not.toBeInTheDocument();
  });
});
