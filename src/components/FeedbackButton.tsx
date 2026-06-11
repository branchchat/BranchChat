// "Feedback" button + dialog for beta testers. Submits to PostHog as a
// structured `feedback_submitted` event with light context (current chat,
// whether they're signed in).
//
// Consent-aware: PostHog starts opted out (see main.tsx), so if a tester has
// analytics off we don't silently drop their feedback — we point them at cookie
// settings instead of capturing.

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { usePostHog } from "@posthog/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { openCookieSettings } from "@/lib/consent";
import {
  buildFeedbackProperties,
  CATEGORY_LABELS,
  FEEDBACK_EVENT,
  type FeedbackCategory,
} from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as FeedbackCategory[];

export function FeedbackButton() {
  const posthog = usePostHog();
  const user = useAuthStore((s) => s.user);
  const chatTitle = useChatStore((s) => s.chats[s.activeChatId]?.title);

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  // PostHog is opt-out by default; only capture when the tester has accepted
  // analytics. has_opted_in_capturing is false in stub/dev (no key) too.
  const canSend = posthog?.has_opted_in_capturing() ?? false;

  const reset = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setMessage("");
      setCategory("idea");
      setSent(false);
    }
  };

  const submit = () => {
    if (!message.trim() || !canSend) return;
    posthog?.capture(
      FEEDBACK_EVENT,
      buildFeedbackProperties(category, message, {
        path: window.location.pathname,
        chatTitle,
        hasAccount: Boolean(user),
      }),
    );
    setSent(true);
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

          {sent ? null : !canSend ? (
            // Respect the analytics opt-out instead of dropping the feedback.
            <div className="space-y-3 py-1 text-sm text-muted-foreground">
              <p>
                Feedback is sent through our privacy-first analytics, which is
                currently off. Turn on analytics to send feedback.
              </p>
              <Button variant="outline" size="sm" onClick={openCookieSettings}>
                Open cookie settings
              </Button>
            </div>
          ) : (
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

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  We attach your current chat for context.
                </span>
                <Button onClick={submit} disabled={!message.trim()}>
                  Send feedback
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
