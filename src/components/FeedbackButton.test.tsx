// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Mock the backend client: feedback now posts to /api/feedback.
const submitFeedback = vi.fn();
vi.mock("@/lib/api", () => ({
  isBackendConfigured: () => true,
  submitFeedback: (...args: unknown[]) => submitFeedback(...args),
}));

import { FeedbackButton } from "@/components/FeedbackButton";

beforeEach(() => {
  submitFeedback.mockReset();
  submitFeedback.mockResolvedValue(undefined);
});

describe("FeedbackButton", () => {
  it("posts feedback to the backend and shows the sent state", async () => {
    render(<FeedbackButton />);
    fireEvent.click(screen.getByRole("button", { name: /feedback/i }));

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "loving the branching" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    await waitFor(() =>
      expect(submitFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "idea",
          message: "loving the branching",
        }),
      ),
    );
    // After submit, the prompt is replaced by the thank-you and the title flips.
    expect(await screen.findByText(/Thanks — got it/)).toBeInTheDocument();
    expect(screen.getByText("Feedback sent")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("surfaces an error and stays on the form when the post fails", async () => {
    submitFeedback.mockRejectedValue(new Error("Request failed (HTTP 401)."));
    render(<FeedbackButton />);
    fireEvent.click(screen.getByRole("button", { name: /feedback/i }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "broken" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    expect(await screen.findByText(/Request failed/)).toBeInTheDocument();
    // Still on the form (not the sent state).
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});
