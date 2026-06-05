// InputBar — the composer. Sends against the currently selected node:
// "Send" continues linearly (addUserMessage); "Branch" starts an alternate
// timeline from the same node (branchFromNode). Enter sends, Shift+Enter
// inserts a newline.

import { useState, type KeyboardEvent } from "react";
import { GitBranch, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useChatStore } from "@/store/chatStore";

const ROLE_LABEL: Record<string, string> = {
  system: "root",
  user: "your message",
  assistant: "assistant reply",
};

export function InputBar() {
  const [draft, setDraft] = useState("");
  const chat = useChatStore((s) => s.chats[s.activeChatId]);
  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const branchFromNode = useChatStore((s) => s.branchFromNode);

  const selected = chat ? chat.nodes[chat.selectedNodeId] : undefined;
  const canSend = draft.trim().length > 0 && !!selected;

  const submit = (mode: "continue" | "branch") => {
    const text = draft.trim();
    if (!text || !selected) return;
    if (mode === "branch") branchFromNode(selected.id, text);
    else addUserMessage(text, selected.id);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit("continue");
    }
  };

  return (
    <div className="border-t bg-background p-3">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          {selected ? (
            <>
              Replying to{" "}
              <span className="font-medium text-foreground">
                {ROLE_LABEL[selected.role] ?? selected.role}
              </span>
              {selected.branchLabel ? ` · ${selected.branchLabel}` : ""} — Send
              continues this path, Branch starts an alternate.
            </>
          ) : (
            "Select a node to continue from."
          )}
        </p>

        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a message… (Enter to send, Shift+Enter for a new line)"
          className="min-h-[64px] resize-none"
        />

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!canSend}
            onClick={() => submit("branch")}
          >
            <GitBranch className="size-4" />
            Branch
          </Button>
          <Button type="button" disabled={!canSend} onClick={() => submit("continue")}>
            <Send className="size-4" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
