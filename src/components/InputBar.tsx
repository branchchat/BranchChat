// InputBar — the composer. Sends against the currently selected node:
// "Send" continues linearly (addUserMessage); "Branch" starts an alternate
// timeline from the same node (branchFromNode); "Branch with model" opens the
// ModelPicker first. Enter sends, Shift+Enter inserts a newline.
//
// Model flow: picking with a draft present branches immediately. Picking with
// an empty draft "arms" the choice (chip above the composer) and the next
// submit creates the model branch — that's the path used by the per-node
// hover action, where the user picks a model before typing the prompt.

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Bot, GitBranch, Paperclip, Send, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModelPicker } from "@/components/ModelPicker";
import {
  fetchAvailableModels,
  isBackendConfigured,
  modelLabel,
  type AttachmentPayload,
} from "@/lib/api";
import { resolveModelForNode, useChatStore } from "@/store/chatStore";
import type { ModelChoice } from "@/types/chat";

const ROLE_LABEL: Record<string, string> = {
  system: "root",
  user: "your message",
  assistant: "assistant reply",
};

// Mirror the backend's Attachment schema caps so rejects happen instantly
// client-side instead of as a 422 after upload.
const ATTACH_MEDIA_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);
const ATTACH_MAX_FILES = 3;
const ATTACH_MAX_BYTES = 1_400_000; // ~1.4 MB per file

// FileReader → raw base64 (the data: prefix stripped).
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// A pending branch waiting for its prompt: armed by clicking "Branch" with an
// empty draft (plain) or by picking a model with an empty draft.
interface ArmedBranch {
  model?: ModelChoice;
  parentId: string;
}

export function InputBar() {
  const [draft, setDraft] = useState("");
  const [armed, setArmed] = useState<ArmedBranch | null>(null);
  const [files, setFiles] = useState<AttachmentPayload[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chat = useChatStore((s) => s.chats[s.activeChatId]);
  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const branchFromNode = useChatStore((s) => s.branchFromNode);
  const modelPickerFor = useChatStore((s) => s.modelPickerFor);
  const openModelPicker = useChatStore((s) => s.openModelPicker);
  const closeModelPicker = useChatStore((s) => s.closeModelPicker);

  const selected = chat ? chat.nodes[chat.selectedNodeId] : undefined;
  // An attachment with no typed text is a valid message ("here's my resume").
  const canSend = (draft.trim().length > 0 || files.length > 0) && !!selected;

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

  // One name only: the model this exchange is happening with — the model
  // that wrote the selected reply, else the branch's inherited model, else
  // the role label (user/root nodes in stub mode, where no model is known).
  const replyingTo = selected
    ? ((selected.role === "assistant" && selected.provider && selected.model
        ? (modelLabel(selected.provider, selected.model) ?? selected.model)
        : null) ??
      inheritedLabel ??
      ROLE_LABEL[selected.role] ??
      selected.role)
    : null;

  // Validate + read picked files into base64 payloads (client-side mirror of
  // the backend caps, so oversized picks fail before any upload).
  const onPickFiles = async (picked: FileList | null) => {
    if (!picked?.length) return;
    setAttachError(null);
    const next = [...files];
    for (const file of Array.from(picked)) {
      if (next.length >= ATTACH_MAX_FILES) {
        setAttachError(`Up to ${ATTACH_MAX_FILES} files per message.`);
        break;
      }
      if (!ATTACH_MEDIA_TYPES.has(file.type)) {
        setAttachError("Images (PNG/JPEG/WebP/GIF) and PDFs only.");
        continue;
      }
      if (file.size > ATTACH_MAX_BYTES) {
        setAttachError(`"${file.name}" is too large (max ~1.4 MB).`);
        continue;
      }
      try {
        next.push({
          name: file.name,
          media_type: file.type,
          data: await readAsBase64(file),
        });
      } catch {
        setAttachError(`Couldn't read "${file.name}".`);
      }
    }
    setFiles(next);
  };

  const submit = (mode: "continue" | "branch") => {
    const text = draft.trim();
    if ((!text && files.length === 0) || !selected) return;
    const attachments = files.length ? files : undefined;
    // An armed model choice always wins: the chip told the user the next
    // message starts a model branch from the chosen node.
    if (armed && chat?.nodes[armed.parentId]) {
      branchFromNode(armed.parentId, text, {
        model: armed.model,
        attachments,
      });
      setArmed(null);
    } else if (mode === "branch") {
      branchFromNode(selected.id, text, { attachments });
    } else {
      addUserMessage(text, selected.id, { attachments });
    }
    setDraft("");
    setFiles([]);
    setAttachError(null);
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
    if (text || files.length) {
      // Draft (or attached file) already in the composer: branch right away.
      branchFromNode(parentId, text, {
        model: choice,
        attachments: files.length ? files : undefined,
      });
      setDraft("");
      setFiles([]);
      setArmed(null);
    } else {
      // No prompt yet: arm the choice; the next submit branches with it.
      setArmed({ parentId, model: choice });
    }
  };

  return (
    <div className="border-t bg-background p-3">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          {selected ? (
            <>
              Replying to{" "}
              <span className="font-medium text-foreground">{replyingTo}</span>{" "}
              — Send continues this path, Branch starts an alternate.
            </>
          ) : (
            "Select a node to continue from."
          )}
        </p>

        {armed && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1.5 py-1">
              {armed.model ? <Bot className="size-3" /> : <GitBranch className="size-3" />}
              {armed.model
                ? `Next message branches with ${armed.model.label ?? armed.model.model}`
                : "Next message starts a new branch"}
              <button
                type="button"
                aria-label="Cancel branch"
                className="ml-0.5 rounded-sm opacity-70 transition-opacity hover:opacity-100"
                onClick={() => setArmed(null)}
              >
                <X className="size-3" />
              </button>
            </Badge>
          </div>
        )}

        {files.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {files.map((f, i) => (
              <Badge key={`${f.name}:${i}`} variant="secondary" className="gap-1.5 py-1">
                <Paperclip className="size-3" />
                {f.name}
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  className="ml-0.5 rounded-sm opacity-70 transition-opacity hover:opacity-100"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
            <span className="text-[11px] text-muted-foreground">
              Sent with this message only — later turns won't see the file.
            </span>
          </div>
        )}
        {attachError && (
          <p role="alert" className="text-xs text-destructive">
            {attachError}
          </p>
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
            size="icon"
            disabled={!selected}
            aria-label="Attach images or PDFs"
            title="Attach images or PDFs (Gemini & Claude read PDFs)"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="size-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              void onPickFiles(e.target.files);
              e.target.value = ""; // allow re-picking the same file
            }}
          />
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
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              // With a draft (or an attached file), branch immediately; with
              // an empty composer, arm branch mode so the next message starts
              // the new branch (same affordance as "Branch with model").
              if (draft.trim() || files.length) submit("branch");
              else setArmed({ parentId: selected.id });
            }}
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
