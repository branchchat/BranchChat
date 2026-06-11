// "Feedback" button + dialog for beta testers. Submits to our own backend
// (POST /api/feedback) so notes are always captured — independent of the
// tester's analytics consent. The widget lives behind the account gate, so
// requests carry the session cookie.

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { isBackendConfigured, submitFeedback } from "@/lib/api";
import { CATEGORY_LABELS, type FeedbackCategory } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/chatStore";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as FeedbackCategory[];

export function FeedbackButton() {
  const chatTitle = useChatStore((s) => s.chats[s.activeChatId]?.title);

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setMessage("");
      setCategory("idea");
      setSent(false);
      setError(null);
      setBusy(false);
    }
  };

  const submit = async () => {
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Local-first dev / e2e (no backend): accept the note so the flow is
      // testable without a server.
      if (isBackendConfigured()) {
        await submitFeedback({
          category,
          message: text,
          path: window.location.pathname,
          chat_title: chatTitle,
        });
      }
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't send that — please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <MessageSquarePlus className="size-4" />
        Feedback
      </Button>

      <Dialog open={open} onOpenChange={reset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{sent ? "Feedback sent" : "Send feedback"}</DialogTitle>
            {/* After submitting, the prompt is replaced by the thank-you so the
                "you're testing a beta" ask doesn't linger over a done state. */}
            <DialogDescription>
              {sent
                ? "Thanks — got it. We read every note."
                : "You're testing an early beta — tell us what's broken or what you wish it did. It helps a lot."}
            </DialogDescription>
          </DialogHeader>

          {sent ? null : (
            <div className="space-y-4">
              <div className="flex gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={cn(
                      "flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors",
                      category === c
                        ? "border-foreground/30 bg-secondary font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/60",
                    )}
                  >
                    {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>

              <Textarea
                autoFocus
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  category === "bug"
                    ? "What happened, and what did you expect?"
                    : "What would make this better?"
                }
              />

              {error && <p className="text-xs text-destructive">{error}</p>}

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  We attach your current chat for context.
                </span>
                <Button onClick={submit} disabled={!message.trim() || busy}>
                  {busy ? "Sending…" : "Send feedback"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
