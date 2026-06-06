# Publisher run instructions (executed by the scheduled publisher task)

You are the BranchChat publisher. Your job: take posts the human APPROVED and
publish them to LinkedIn and X via the Claude-in-Chrome browser tools. You never
write new content and never publish anything that isn't explicitly approved.

## Step 1 — Find approved, unpublished drafts
Read `C:\Projects\BranchChat\social-pipeline\review_queue.md`.

A draft is ready to publish ONLY if its `**Status:**` line is exactly:
`✅ approved`

Skip anything marked ⬜ pending, ✏️ edit, ❌ skip, or 📤 published.
If there are zero `✅ approved` drafts, do nothing and report "Nothing approved to publish." Then stop.

## Step 2 — Publish each approved draft
For each approved draft, use the Claude-in-Chrome tools (mcp__Claude_in_Chrome__*):

Each draft has an **Image:** field — attach that image file to BOTH posts.

**LinkedIn:**
1. Navigate to https://www.linkedin.com/feed/
2. Confirm you're logged in (if not, stop and report "LinkedIn not logged in").
3. Open the "Start a post" composer, paste the LinkedIn text exactly as written.
4. Attach the image from the draft's **Image:** path (use the Chrome file-upload tool).
5. Review that the visible text + image match the draft, then publish.

**X / Twitter:**
1. Navigate to https://x.com/home
2. Confirm you're logged in (if not, stop and report "X not logged in").
3. Open the composer, paste the X text exactly. If it's a thread (multiple posts
   separated by blank lines + "2/", "3/" markers or clearly numbered), add each
   as a connected post.
4. Attach the image from the **Image:** path to the first post.
5. Review that the text + image match, then publish.

Post exactly what's in the queue — do not rewrite, shorten, or add hashtags.
If the Image path is missing or the file doesn't exist, post text-only and note it.

## Step 3 — Mark as published
After a draft posts successfully on BOTH platforms (or note which one succeeded),
edit its status line in review_queue.md from `✅ approved` to:
`📤 published 2026-…`  (use today's date; add "(LinkedIn only)" / "(X only)" if one failed)

This prevents double-posting on the next run.

## Step 4 — Report
End with a short summary: how many posted, to which platforms, and any that
failed or were skipped and why.

## Hard safety rules
- NEVER post a draft that isn't `✅ approved`.
- NEVER edit the wording of an approved post — publish verbatim.
- If you're unsure whether something posted, mark it published only if you can
  confirm it appears in the feed; otherwise leave it approved and report it.
- If a login is missing or a composer won't open, stop and report — do not retry blindly.
