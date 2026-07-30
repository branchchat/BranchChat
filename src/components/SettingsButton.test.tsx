// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Mock the backend client: settings talks to /api/keys.
const fetchApiKeys = vi.fn();
const saveApiKey = vi.fn();
const deleteApiKey = vi.fn();
vi.mock("@/lib/api", () => ({
  isBackendConfigured: () => true,
  fetchApiKeys: (...args: unknown[]) => fetchApiKeys(...args),
  saveApiKey: (...args: unknown[]) => saveApiKey(...args),
  deleteApiKey: (...args: unknown[]) => deleteApiKey(...args),
}));

import { SettingsButton } from "@/components/SettingsButton";

beforeEach(() => {
  fetchApiKeys.mockReset().mockResolvedValue([]);
  saveApiKey.mockReset();
  deleteApiKey.mockReset().mockResolvedValue(undefined);
});

describe("SettingsButton", () => {
  it("saves a key as a password field and then shows only its hint", async () => {
    saveApiKey.mockResolvedValue([
      {
        provider: "gemini",
        key_hint: "wxyz",
        created_at: "2026-07-30T00:00:00Z",
      },
    ]);
    render(<SettingsButton />);
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));
    await waitFor(() => expect(fetchApiKeys).toHaveBeenCalled());

    const input = screen.getByLabelText("Google Gemini API key");
    // The key must never render on screen while typing.
    expect(input).toHaveAttribute("type", "password");
    fireEvent.change(input, { target: { value: "AIzaSecret1234wxyz" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^save$/i })[0]);

    await waitFor(() =>
      expect(saveApiKey).toHaveBeenCalledWith("gemini", "AIzaSecret1234wxyz"),
    );
    // Stored state: hint chip + remove button, no more input for that row.
    expect(await screen.findByText("••••wxyz")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remove google gemini key/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Google Gemini API key"),
    ).not.toBeInTheDocument();
    // The full key never appears anywhere in the dialog.
    expect(screen.queryByText(/AIzaSecret1234wxyz/)).not.toBeInTheDocument();
  });

  it("surfaces the backend's rejection detail and keeps the form", async () => {
    saveApiKey.mockRejectedValue(
      new Error("That API key was rejected by the provider — check it and try again."),
    );
    render(<SettingsButton />);
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));

    const input = await screen.findByLabelText("OpenAI API key");
    fireEvent.change(input, { target: { value: "sk-bad-key-123" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^save$/i })[1]);

    expect(
      await screen.findByText(/rejected by the provider/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("OpenAI API key")).toBeInTheDocument();
  });

  it("lists stored keys and removes one", async () => {
    fetchApiKeys.mockResolvedValue([
      {
        provider: "anthropic",
        key_hint: "t3st",
        created_at: "2026-07-30T00:00:00Z",
      },
    ]);
    render(<SettingsButton />);
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));

    expect(await screen.findByText("••••t3st")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /remove anthropic key/i }),
    );
    await waitFor(() => expect(deleteApiKey).toHaveBeenCalledWith("anthropic"));
    // Back to the input state for that provider.
    expect(await screen.findByLabelText("Anthropic API key")).toBeInTheDocument();
    expect(screen.queryByText("••••t3st")).not.toBeInTheDocument();
  });
});
