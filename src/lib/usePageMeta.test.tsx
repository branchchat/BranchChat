// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { usePageMeta } from "@/lib/usePageMeta";

// The hook captures index.html defaults at module load. In jsdom that's an
// empty title and no description meta, so unmount should restore to "" and
// remove any description tag the hook created.

function Probe({ title, description }: { title: string; description?: string }) {
  usePageMeta(title, description);
  return null;
}

function descMeta() {
  return document.querySelector<HTMLMetaElement>('meta[name="description"]');
}

afterEach(() => {
  document.title = "";
  descMeta()?.remove();
});

describe("usePageMeta", () => {
  it("sets the document title while mounted and restores the default on unmount", () => {
    const { unmount } = render(<Probe title="Privacy Policy · BranchChat" />);
    expect(document.title).toBe("Privacy Policy · BranchChat");

    unmount();
    expect(document.title).toBe("");
  });

  it("creates a description meta and removes it on unmount (no default to keep)", () => {
    const { unmount } = render(
      <Probe title="Terms · BranchChat" description="The BranchChat terms." />,
    );
    expect(descMeta()?.content).toBe("The BranchChat terms.");

    unmount();
    // Nothing in index.html to restore to, so the created tag is removed.
    expect(descMeta()).toBeNull();
  });

  it("leaves the description untouched when none is provided", () => {
    const { unmount } = render(<Probe title="BranchChat App" />);
    expect(document.title).toBe("BranchChat App");
    expect(descMeta()).toBeNull();
    unmount();
  });
})
