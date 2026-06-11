// Beta feedback → PostHog.
//
// Captured as a structured `feedback_submitted` event (not a raw analytics
// autocapture), so you can build an Insight on it or break it down by category.
// Pure here so the property-shaping is unit-testable; the component does the
// actual posthog.capture() with the user's consent.

export const FEEDBACK_EVENT = "feedback_submitted";

export type FeedbackCategory = "bug" | "idea" | "other";

export const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Bug",
  idea: "Idea",
  other: "Other",
};

// Context auto-attached to every submission — things we already know, so the
// tester doesn't have to describe where they were.
export interface FeedbackContext {
  path: string;
  chatTitle?: string;
  hasAccount: boolean;
}

export interface FeedbackProperties {
  category: FeedbackCategory;
  message: string;
  path: string;
  chat_title?: string;
  has_account: boolean;
  source: "beta-widget";
}

export function buildFeedbackProperties(
  category: FeedbackCategory,
  message: string,
  ctx: FeedbackContext,
): FeedbackProperties {
  return {
    category,
    message: message.trim(),
    path: ctx.path,
    chat_title: ctx.chatTitle,
    has_account: ctx.hasAccount,
    source: "beta-widget",
  };
}
