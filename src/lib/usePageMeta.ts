// Per-route <title> + <meta name="description"> for the SPA.
//
// Only index.html is served for every route (Cloudflare Pages SPA fallback),
// so without this every route inherits the homepage's title/description. This
// hook lets a route set its own, then restores the homepage defaults when it
// unmounts.
//
// The defaults are captured ONCE at module load — before any route mounts and
// overrides them — so we inherit whatever index.html ships (the marketing
// title/description live there on the deployed `roshaan/landing` branch)
// instead of duplicating that copy here. The homepage ("/") therefore needs no
// hook: it's the authority, and sub-routes restore to it on the way out.
//
// Roshaan's SEO note: do NOT remove the verification/OG/JSON-LD tags from
// index.html — this hook never touches them, only title + description.

import { useEffect } from "react";

const DEFAULT_TITLE = document.title;
const DEFAULT_DESCRIPTION =
  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ??
  null;

// Set (or, with null, restore-to-absent) the description meta. Creates the tag
// on demand; removes a tag we created only when there was no homepage default
// to fall back to, so we never leave an empty <meta> behind on this branch
// (which ships no description) while preserving the real one on prod.
function setDescription(content: string | null) {
  let el = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (content === null) {
    if (el && DEFAULT_DESCRIPTION === null) el.remove();
    else if (el) el.content = "";
    return;
  }
  if (!el) {
    el = document.createElement("meta");
    el.name = "description";
    document.head.appendChild(el);
  }
  el.content = content;
}

export function usePageMeta(title: string, description?: string): void {
  useEffect(() => {
    document.title = title;
    if (description !== undefined) setDescription(description);
    return () => {
      document.title = DEFAULT_TITLE;
      setDescription(DEFAULT_DESCRIPTION);
    };
  }, [title, description]);
}
