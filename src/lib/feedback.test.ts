import { describe, expect, it } from "vitest";

import { buildFeedbackProperties } from "@/lib/feedback";

describe("buildFeedbackProperties", () => {
  it("trims the message and attaches context + a stable source tag", () => {
    const props = buildFeedbackProperties("bug", "  it broke  ", {
      path: "/app",
      chatTitle: "Kyoto trip",
      hasAccount: true,
    });
    expect(props).toEqual({
      category: "bug",
      message: "it broke",
      path: "/app",
      chat_title: "Kyoto trip",
      has_account: true,
      source: "beta-widget",
    });
  });

  it("tolerates missing chat context", () => {
    const props = buildFeedbackProperties("idea", "more colors", {
      path: "/app",
      hasAccount: false,
    });
    expect(props.chat_title).toBeUndefined();
    expect(props.has_account).toBe(false);
  });
});
