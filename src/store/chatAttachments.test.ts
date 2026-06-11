// @vitest-environment jsdom
//
// Attachment threading at the store level: the user node keeps display
// metadata (name + media type) and NEVER the base64 payload — bytes in
// localStorage would blow past the storage budget and the sync payload cap.

import { beforeEach, describe, expect, it } from "vitest";

import { useChatStore } from "@/store/chatStore";

const FILE = { name: "diagram.png", media_type: "image/png", data: "aGk=" };

beforeEach(() => {
  localStorage.clear();
  useChatStore.getState().createChat({ title: "t" });
});

describe("attachments on messages", () => {
  it("stamps metadata (not bytes) on the user node", () => {
    const result = useChatStore.getState().addUserMessage("what is this?", undefined, {
      attachments: [FILE],
    });
    expect(result).not.toBeNull();
    const chat = useChatStore.getState().chats[useChatStore.getState().activeChatId];
    const userNode = chat.nodes[result!.userId];
    expect(userNode.attachments).toEqual([
      { name: "diagram.png", mediaType: "image/png" },
    ]);
    expect(JSON.stringify(userNode)).not.toContain("aGk=");
  });

  it("stamps metadata on branch messages too", () => {
    const state = useChatStore.getState();
    const chat = state.chats[state.activeChatId];
    const result = state.branchFromNode(chat.rootId, "compare this", {
      attachments: [FILE],
    });
    const userNode =
      useChatStore.getState().chats[useChatStore.getState().activeChatId]
        .nodes[result!.userId];
    expect(userNode.attachments?.[0]).toEqual({
      name: "diagram.png",
      mediaType: "image/png",
    });
  });

  it("leaves nodes without attachments unchanged", () => {
    const result = useChatStore.getState().addUserMessage("plain text");
    const userNode =
      useChatStore.getState().chats[useChatStore.getState().activeChatId]
        .nodes[result!.userId];
    expect(userNode.attachments).toBeUndefined();
  });
});
