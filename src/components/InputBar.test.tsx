// @vitest-environment jsdom
//
// The composer's "Replying to" line: a model-stamped assistant reply shows
// the MODEL name, not the generic "assistant reply"; the trailing "answers
// with" only renders when it differs from the name already shown.

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { InputBar } from "@/components/InputBar";
import { useChatStore } from "@/store/chatStore";
import type { ChatNode, ChatSessionState } from "@/types/chat";

function node(partial: Partial<ChatNode> & { id: string }): ChatNode {
  return {
    parentId: null,
    role: "assistant",
    content: "x",
    childrenIds: [],
    createdAt: 1,
    ...partial,
  };
}

function chatWith(selected: ChatNode): ChatSessionState {
  return {
    id: "c1",
    title: "t",
    workspace: "personal",
    nodes: { [selected.id]: selected },
    rootId: selected.id,
    selectedNodeId: selected.id,
    activePath: [selected.id],
    collapsedNodeIds: [],
    journalEntries: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

beforeEach(() => {
  useChatStore.setState({ activeChatId: "c1" });
});

describe("InputBar replying-to line", () => {
  it("names the model that wrote a stamped assistant reply", () => {
    useChatStore.setState({
      chats: {
        c1: chatWith(
          node({ id: "a1", provider: "gemini", model: "gemini-2.5-flash" }),
        ),
      },
    });
    render(<InputBar />);
    // Catalog cache is empty in jsdom, so the raw id is the display fallback.
    expect(screen.getByText("gemini-2.5-flash")).toBeInTheDocument();
    expect(screen.queryByText("assistant reply")).not.toBeInTheDocument();
    // Same model inherited for the next reply → no redundant "answers with".
    expect(screen.queryByText(/answers with/)).not.toBeInTheDocument();
  });

  it("falls back to the role label for unstamped replies", () => {
    useChatStore.setState({ chats: { c1: chatWith(node({ id: "a1" })) } });
    render(<InputBar />);
    expect(screen.getByText("assistant reply")).toBeInTheDocument();
  });
});
