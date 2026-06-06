# BranchChat Social Pipeline — How It Works

A hands-off content pipeline. You approve; everything else runs itself.

```
  ┌─────────────┐   ┌──────────────┐   ┌──────────────┐   ┌─────────────┐   ┌──────────┐
  │ 1. SCAN     │ → │ 2. ANGLE     │ → │ 3. DRAFT     │ → │ 4. REVIEW   │ → │ 5. POST  │
  │ trending in │   │ generate     │   │ LinkedIn + X │   │ you approve │   │ publish  │
  │ the niche   │   │ brand angles │   │ in our voice │   │ /edit/skip  │   │          │
  └─────────────┘   └──────────────┘   └──────────────┘   └─────────────┘   └──────────┘
       auto              auto                auto             ← YOU            semi-auto
```

## Stage 1 — Scan (automated, daily)

Each morning the scheduled task sweeps these sources for what's trending in our
niche (non-linear thinking, AI research tools, prompt engineering, LLM workflows):

| Source | How it's scanned | Looking for |
|--------|------------------|-------------|
| Reddit | web search on r/MachineLearning, r/LocalLLaMA, r/ArtificialIntelligence, r/PhD, r/AcademicResearch | hot threads, recurring pain points |
| News / blogs | web search, last 24–48h | AI model launches, research-tool news |
| Substack | web search of popular AI/research newsletters | emerging takes, essays |
| LinkedIn | web search + (optional) Chrome read of feed | what researchers/founders are posting |
| X / Twitter | web search of trending AI discourse | fast-moving takes to react to |

Output: a ranked shortlist of 3–5 topics with *why it's relevant to BranchChat*.

> Note on access: Reddit/LinkedIn/X don't expose clean read APIs here, so scanning
> uses web search first, and Claude-in-Chrome to read a logged-in feed when you
> want deeper signal. Web search alone is enough to start.

## Stage 2 — Angle generation (automated)

For each shortlisted topic, the agent generates **2–3 distinct angles** from
BranchChat's POV, using the pillars in `01_brand_brief.md`. Example for a topic
like "everyone's frustrated comparing GPT vs Claude outputs":

- Angle A (workflow): "You're pasting the same prompt into 3 tabs. There's a better way."
- Angle B (contrarian): "Model comparison is a branching problem, not a copy-paste problem."
- Angle C (researcher): "How I run a lit-review prompt across 4 models without losing the thread."

## Stage 3 — Draft (automated)

For each chosen angle it writes platform-native drafts:
- **LinkedIn**: hook + body + soft CTA, ≤1300 chars
- **X**: single post ≤280 chars, OR a 3–6 post thread for bigger ideas

All drafts obey the voice rules + banned-words list in the brief.

## Stage 4 — Review (YOU)

Drafts land in two places:
1. **`review_queue.md`** in this folder — dated, copy-pasteable.
2. The **review dashboard artifact** — a live page you can re-open any morning.

You approve, lightly edit, or skip. This is the only step that needs you, and it
takes ~2 minutes/day.

## Stage 5 — Publish (automated, weekday noon)

The **publisher** scheduled task runs each weekday at 12pm. It:
1. Reads `review_queue.md` and finds every draft marked exactly `✅ approved`.
2. Posts the LinkedIn text to linkedin.com and the X text to x.com **verbatim**,
   via the Claude-in-Chrome browser tools.
3. Changes each posted draft's status to `📤 published <date>` so it never
   posts twice.
4. If nothing is approved, it does nothing — so the cadence is always safe.

Instructions it follows: `publish_prompt.md`.

### Requirements for publishing to work
- Be **logged into LinkedIn and X in Chrome**, with the Claude-in-Chrome
  extension connected.
- Click **"Run now"** on the publisher task once to pre-approve browser control
  (otherwise the first scheduled run pauses for permission).

### The daily rhythm
| Time | What happens | Who |
|------|--------------|-----|
| 8:00 am | Scan + draft → drafts land in queue | agent |
| 8:00–12:00 | You mark drafts `✅ approved` (or edit/skip) | you |
| 12:00 pm | Approved drafts post to LinkedIn + X | agent |

Want a longer review window? Move the publisher later (e.g. `0 15 * * 1-5` = 3pm).

## Files in this folder

| File | Purpose |
|------|---------|
| `01_brand_brief.md` | The "brain" — voice, niche, pillars, rules. Edit to retune. |
| `02_pipeline_spec.md` | This file — how the pipeline works. |
| `run_prompt.md` | The exact instructions the scheduled task runs each day. |
| `review_queue.md` | Where daily drafts land for your approval. |

## Tuning it over time

- Posts landing flat? Edit the pillars/voice in `01_brand_brief.md`.
- Want more/less frequency? Change the schedule (daily → weekday → 2x/week).
- Want a third platform (Reddit/Substack)? Add it to the draft step in `run_prompt.md`.
