// @vitest-environment jsdom
//
// The account gate's three backend-configured states. AppChat and AuthDialog
// are stubbed — this covers the gate's routing decisions, not the app.

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/store/authStore";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  isBackendConfigured: () => true,
}));
vi.mock("@/components/AppChat", () => ({
  AppChat: () => <div data-testid="app-chat" />,
}));
vi.mock("@/components/AuthDialog", () => ({
  AuthDialog: ({ open, initialMode }: { open: boolean; initialMode?: string }) => (
    <div data-testid="auth-dialog" data-open={open} data-mode={initialMode} />
  ),
}));

import { AppGate } from "@/pages/AppGate";

function setAuth(user: object | null) {
  useAuthStore.setState({
    user,
    hydrated: true,
    hydrate: vi.fn(async () => {}),
  } as never);
}

function renderGate(initialEntry = "/app") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppGate />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AppGate (account-gated beta)", () => {
  it("asks signed-out visitors to sign in or create an account", () => {
    setAuth(null);
    renderGate();
    expect(screen.getByText("Private beta")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in or create account/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("app-chat")).not.toBeInTheDocument();
  });

  it("shows the pending screen for unapproved accounts", () => {
    setAuth({
      id: "u1",
      email: "tester@example.com",
      email_verified: true,
      is_beta_tester: false,
      created_at: "2026-06-10",
    });
    renderGate();
    expect(screen.getByText("You're on the list")).toBeInTheDocument();
    expect(screen.getByText(/tester@example\.com/)).toBeInTheDocument();
    expect(screen.queryByTestId("app-chat")).not.toBeInTheDocument();
  });

  it("auto-opens the auth dialog on the form named by ?auth= (deep link from /beta)", () => {
    setAuth(null);
    renderGate("/app?auth=signup");
    const dialog = screen.getByTestId("auth-dialog");
    expect(dialog).toHaveAttribute("data-open", "true");
    expect(dialog).toHaveAttribute("data-mode", "signup");
  });

  it("does not auto-open the dialog without the ?auth= param", () => {
    setAuth(null);
    renderGate();
    expect(screen.getByTestId("auth-dialog")).toHaveAttribute(
      "data-open",
      "false",
    );
  });

  it("renders the app for approved accounts", () => {
    setAuth({
      id: "u1",
      email: "tester@example.com",
      email_verified: true,
      is_beta_tester: true,
      created_at: "2026-06-10",
    });
    renderGate();
    expect(screen.getByTestId("app-chat")).toBeInTheDocument();
  });
});
