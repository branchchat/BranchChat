// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// Mutable mock of the PostHog client so each test can vary opt-in state.
const capture = vi.fn();
let optedIn = true;
vi.mock("@posthog/react", () => ({
  usePostHog: () => ({
    capture,
    has_opted_in_capturing: () => optedIn,
  }),
}));

import { FeedbackButton } from "@/components/FeedbackButton";
import { FEEDBACK_EVENT } from "@/lib/feedback";

beforeEach(() => {
  capture.mockClear();
  optedIn = true;
});

describe("FeedbackButton", () => {
  it("captures a structured feedback event when opted in", () => {
    render(<FeedbackButton />);
    fireEvent.click(screen.getByRole("button", { name: /feedback/i }));

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "loving the branching" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    expect(capture).toHaveBeenCalledWith(
      FEEDBACK_EVENT,
      expect.objectContaining({
        category: "idea",
        message: "loving the branching",
        source: "beta-widget",
      }),
    );
    // Success state replaces the form.
    expect(screen.getByText(/Thanks — got it/)).toBeInTheDocument();
  });

  it("does not capture when analytics is opted out; offers cookie settings", () => {
    optedIn = false;
    render(<FeedbackButton />);
    fireEvent.click(screen.getByRole("button", { name: /feedback/i }));

    expect(
      screen.getByRole("button", { name: /open cookie settings/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(capture).not.toHaveBeenCalled();
  });
});
