// @vitest-environment jsdom
//
// Session-expiry handling: an auth-shaped chat failure re-verifies the
// session and raises authStore.sessionExpired (AppChat pops the sign-in
// dialog on that flag) — but only when the session is actually gone.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...real,
    isBackendConfigured: () => true,
    requestChatReply: vi.fn(),
    fetchCurrentUser: vi.fn(),
    fetchUsage: vi.fn(async () => null),
    loginRequest: vi.fn(),
  };
});

const api = vi.mocked(await import("@/lib/api"));
import { ChatApiError } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  api.fetchUsage.mockResolvedValue(null as never);
  useChatStore.getState().createChat({ title: "t" });
  useAuthStore.setState({
    user: { email: "tester@example.com" },
    hydrated: true,
    sessionExpired: false,
  } as never);
});

describe("session expiry", () => {
  it("flags sessionExpired when a chat call 401s and /me confirms the session is gone", async () => {
    api.requestChatReply.mockRejectedValue(
      new ChatApiError("Your session has expired. Sign in again to continue.", 401),
    );
    api.fetchCurrentUser.mockResolvedValue(null as never);

    const result = useChatStore.getState().addUserMessage("hello");
    await vi.waitFor(() =>
      expect(useAuthStore.getState().sessionExpired).toBe(true),
    );
    // The node still records what happened (with the accurate message).
    const chat =
      useChatStore.getState().chats[useChatStore.getState().activeChatId];
    expect(chat.nodes[result!.assistantId].content).toContain(
      "session has expired",
    );
  });

  it("does not flag on a 403 while the session is still alive (e.g. awaiting approval)", async () => {
    api.requestChatReply.mockRejectedValue(
      new ChatApiError("Your account is awaiting beta approval.", 403),
    );
    api.fetchCurrentUser.mockResolvedValue({
      email: "tester@example.com",
    } as never);

    const result = useChatStore.getState().addUserMessage("hello");
    await vi.waitFor(() => {
      const chat =
        useChatStore.getState().chats[useChatStore.getState().activeChatId];
      expect(chat.nodes[result!.assistantId].isError).toBe(true);
    });
    expect(api.fetchCurrentUser).toHaveBeenCalled();
    expect(useAuthStore.getState().sessionExpired).toBe(false);
  });

  it("login clears the flag", async () => {
    useAuthStore.setState({ sessionExpired: true } as never);
    api.loginRequest.mockResolvedValue({ email: "t@x.com" } as never);
    await useAuthStore.getState().login("t@x.com", "pw-long-enough");
    expect(useAuthStore.getState().sessionExpired).toBe(false);
  });
});
