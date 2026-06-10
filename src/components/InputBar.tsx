// InputBar — the composer. Sends against the currently selected node:
// "Send" continues linearly (addUserMessage); "Branch" starts an alternate
// timeline from the same node (branchFromNode); "Branch with model" opens the
// ModelPicker first. Enter sends, Shift+Enter inserts a newline.
//
// Model flow: picking with a draft present branches immediately. Picking with
// an empty draft "arms" the choice (chip above the composer) and the next
// submit creates the model branch — that's the path used by the per-node
// hover action, where the user picks a model before typing the prompt.

import { useEffect, useState, type KeyboardEvent } from "react";
import { Bot, GitBranch, Send, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModelPicker } from "@/components/ModelPicker";
import { fetchAvailableModels, isBackendConfigured, modelLabel } from "@/lib/api";
import { resolveModelForNode, useChatStore } from "@/store/chatStore";
import type { ModelChoice } from "@/types/chat";

const ROLE_LABEL: Record<string, string> = {
  system: "root",
  user: "your message",
  assistant: "assistant reply",
};

// A picked model waiting for its branch prompt to be typed.
interface ArmedBranch extends ModelChoice {
  parentId: string;
}

export function InputBar() {
  const [draft, setDraft] = useState("");
  const [armed, setArmed] = useState<ArmedBranch | null>(null);
  const chat = useChatStore((s) => s.chats[s.activeChatId]);
  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const branchFromNode = useChatStore((s) => s.branchFromNode);
  const modelPickerFor = useChatStore((s) => s.modelPickerFor);
  const openModelPicker = useChatStore((s) => s.openModelPicker);
  const closeModelPicker = useChatStore((s) => s.closeModelPicker);

  const selected = chat ? chat.nodes[chat.selectedNodeId] : undefined;
  const canSend = draft.trim().length > 0 && !!selected;

  // Warm the model-catalog cache so node badges and the inherited-model line
  // can resolve display labels synchronously. No-op in stub mode.
  useEffect(() => {
    if (isBackendConfigured()) void fetchAvailableModels().catch(() => {});
  }, []);

  // The model the selected path answers with (nearest ancestor override).
  const inherited = chat
    ? resolveModelForNode(chat.nodes, chat.selectedNodeId)
    : null;
  const inheritedLabel = inherited
    ? (inherited.label ??
      modelLabel(inherited.provider, inherited.model) ??
      inherited.model)
    : null;

  const submit = (mode: "continue" | "branch") => {
    const text = draft.trim();
    if (!text || !selected) return;
    // An armed model choice always wins: the chip told the user the next
    // message starts a model branch from the chosen node.
    if (armed && chat?.nodes[armed.parentId]) {
      branchFromNode(armed.parentId, text, {
        model: { provider: armed.provider, model: armed.model, label: armed.label },
      });
      setArmed(null);
    } else if (mode === "branch") {
      branchFromNode(selected.id, text);
    } else {
      addUserMessage(text, selected.id);
    }
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit("continue");
    }
  };

  const onPickModel = (choice: ModelChoice) => {
    const parentId = modelPickerFor ?? selected?.id;
    if (!parentId) return;
    const text = draft.trim();
    if (text) {
      // Draft already written: branch right away.
      branchFromNode(parentId, text, { model: choice });
      setDraft("");
      setArmed(null);
    } else {
      // No prompt yet: arm the choice; the next submit branches with it.
      setArmed({ parentId, ...choice });
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
              {selected.branchLabel ? ` · ${selected.branchLabel}` : ""}
              {inheritedLabel ? (
                <>
                  {" · answers with "}
                  <span className="font-medium text-foreground">
                    {inheritedLabel}
                  </span>
                </>
              ) : null}{" "}
              — Send continues this path, Branch starts an alternate.
            </>
          ) : (
            "Select a node to continue from."
          )}
        </p>

        {armed && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1.5 py-1">
              <Bot className="size-3" />
              Next message branches with {armed.label ?? armed.model}
              <button
                type="button"
                aria-label="Cancel model branch"
                className="ml-0.5 rounded-sm opacity-70 transition-opacity hover:opacity-100"
                onClick={() => setArmed(null)}
              >
                <X className="size-3" />
              </button>
            </Badge>
          </div>
        )}

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
            disabled={!selected}
            aria-label="Branch with model"
            onClick={() => selected && openModelPicker(selected.id)}
          >
            <Bot className="size-4" />
            Branch with model
          </Button>
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

      <ModelPicker
        open={modelPickerFor !== null}
        onOpenChange={(open) => {
          if (!open) closeModelPicker();
        }}
        parentId={modelPickerFor}
        draft={draft}
        onPick={onPickModel}
      />
    </div>
  );
}
