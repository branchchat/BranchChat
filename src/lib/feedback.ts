// Beta feedback categories (shared by the FeedbackButton UI). Submission now
// goes to our backend (POST /api/feedback via lib/api), so this module only
// holds the category vocabulary the dialog renders.

export type FeedbackCategory = "bug" | "idea" | "other";

export const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Bug",
  idea: "Idea",
  other: "Other",
};
