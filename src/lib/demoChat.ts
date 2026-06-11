// Sample branching conversations for the sidebar's demo actions.
//
// Three demos, each showing a different way to use the tree, none spending
// real quota. Kept as pure builders (id factories injected by the store) so
// they reuse the store's id scheme and stay testable.
//
// - kyoto: the original intro — one question, two alternate plans.
// - research: a deep-research workflow. Each branch hands a sub-question to
//   a different model (modelOverride on the branch's first user node) and
//   the synthesis step pulls in the other branch via a context link.
// - coding: an advanced debugging session. Two candidate fixes for a real
//   Postgres race condition, each explored by a different model so the
//   approaches can be compared side by side.
//
// Assistant nodes carry provider/model stamps (the badge ChatNode shows for
// "what generated this reply"); branch user nodes carry modelOverride with a
// label so the composer chip and inheritance behave like the real feature.

import type { ChatNode, ChatSessionState, JournalEntry } from "@/types/chat";

export interface DemoIdFactory {
  node: () => string;
  chat: () => string;
  journal: () => string;
  comment: () => string;
}

export type DemoKind = "kyoto" | "research" | "coding";

export function buildDemoChat(ids: DemoIdFactory): ChatSessionState {
  const now = Date.now();

  // Generate ids up front so we can wire parent/child links explicitly.
  const root = ids.node();
  const u1 = ids.node();
  const a1 = ids.node();
  const u2a = ids.node(); // branch A: temples
  const a2a = ids.node();
  const u2b = ids.node(); // branch B: food
  const a2b = ids.node();
  const u3a = ids.node(); // continuation on branch A
  const a3a = ids.node();

  const mk = (n: Omit<ChatNode, "childrenIds" | "createdAt"> &
    Partial<Pick<ChatNode, "childrenIds">>): ChatNode => ({
    childrenIds: [],
    createdAt: now,
    ...n,
  });

  const nodes: Record<string, ChatNode> = {
    [root]: mk({
      id: root,
      parentId: null,
      role: "system",
      content:
        "Demo conversation — explore the tree. This branch asks about a 3-day Kyoto trip, then splits into two alternate plans. Click any node to select it; use Branch to start your own alternate path.",
      childrenIds: [u1],
    }),
    [u1]: mk({
      id: u1,
      parentId: root,
      role: "user",
      content: "I'm planning a 3-day trip to Kyoto. What should I prioritize?",
      childrenIds: [a1],
    }),
    [a1]: mk({
      id: a1,
      parentId: u1,
      role: "assistant",
      content:
        "Three days is enough for a strong overview. A common split: Day 1 eastern Higashiyama (temples + old streets), Day 2 Arashiyama (bamboo grove, riverside), Day 3 central Kyoto + day-trip options. Want to lean toward temples and gardens, or food and markets?",
      childrenIds: [u2a, u2b],
    }),

    // Branch A — temples & gardens
    [u2a]: mk({
      id: u2a,
      parentId: a1,
      role: "user",
      content: "Focus on temples and gardens.",
      branchLabel: "Temples & gardens",
      childrenIds: [a2a],
    }),
    [a2a]: mk({
      id: a2a,
      parentId: u2a,
      role: "assistant",
      content:
        "Then prioritize: Kiyomizu-dera at opening, the Philosopher's Path to Ginkaku-ji, Ryoan-ji's rock garden, and Saiho-ji (moss garden, reservation required). Tofuku-ji is stunning if you're there in autumn.",
      tags: ["itinerary", "must-see"],
      comments: [
        {
          id: ids.comment(),
          content: "Saiho-ji needs a postcard reservation weeks ahead — book first.",
          createdAt: now,
        },
      ],
      childrenIds: [u3a],
    }),
    [u3a]: mk({
      id: u3a,
      parentId: a2a,
      role: "user",
      content: "Which one is best at sunrise?",
      childrenIds: [a3a],
    }),
    [a3a]: mk({
      id: a3a,
      parentId: u3a,
      role: "assistant",
      content:
        "Kiyomizu-dera. It opens at 6am, the hillside terrace catches first light over the city, and you'll beat the crowds that fill the approach by mid-morning.",
      childrenIds: [],
    }),

    // Branch B — food & markets
    [u2b]: mk({
      id: u2b,
      parentId: a1,
      role: "user",
      content: "Actually, focus on food and markets.",
      branchLabel: "Food & markets",
      childrenIds: [a2b],
    }),
    [a2b]: mk({
      id: a2b,
      parentId: u2b,
      role: "assistant",
      content:
        "Then build around Nishiki Market (start hungry), a kaiseki dinner in Gion, Fushimi for sake breweries, and Pontocho Alley after dark. Don't skip a tofu lunch near Nanzen-ji.",
      tags: ["itinerary"],
      childrenIds: [],
    }),
  };

  // Active path follows branch A down to the sunrise answer.
  const activePath = [root, u1, a1, u2a, a2a, u3a, a3a];

  const journalEntries: JournalEntry[] = [
    {
      id: ids.journal(),
      type: "branch",
      message: 'Branched from "What should I prioritize?" as Food & markets',
      nodeId: u2b,
      createdAt: now,
    },
  ];

  return {
    id: ids.chat(),
    title: "Demo: Kyoto trip",
    workspace: "personal",
    nodes,
    rootId: root,
    selectedNodeId: a3a,
    activePath,
    collapsedNodeIds: [],
    journalEntries,
    createdAt: now,
    updatedAt: now,
  };
}

// Deep-research demo: model-specific branches + a context link feeding the
// technical branch's findings into the market branch's synthesis step.
export function buildResearchDemoChat(ids: DemoIdFactory): ChatSessionState {
  const now = Date.now();

  const root = ids.node();
  const u1 = ids.node();
  const a1 = ids.node();
  const u2a = ids.node(); // branch A: technical deep dive (Opus)
  const a2a = ids.node();
  const u2b = ids.node(); // branch B: market analysis (GPT)
  const a2b = ids.node();
  const u3b = ids.node(); // synthesis on branch B, context-linked to a2a
  const a3b = ids.node();

  const mk = (n: Omit<ChatNode, "childrenIds" | "createdAt"> &
    Partial<Pick<ChatNode, "childrenIds">>): ChatNode => ({
    childrenIds: [],
    createdAt: now,
    ...n,
  });

  const nodes: Record<string, ChatNode> = {
    [root]: mk({
      id: root,
      parentId: null,
      role: "system",
      content:
        "Demo: a deep-research workflow. One question fans out into branches, each handed to the model best suited for it. The dashed edge is a context link: the synthesis step pulls the technical branch's findings into the market branch. Sample content, no quota spent.",
      childrenIds: [u1],
    }),
    [u1]: mk({
      id: u1,
      parentId: root,
      role: "user",
      content:
        "I'm researching solid-state batteries for an investment memo. Give me the lay of the land.",
      childrenIds: [a1],
    }),
    [a1]: mk({
      id: a1,
      parentId: u1,
      role: "assistant",
      provider: "gemini",
      model: "gemini-2.5-flash",
      content:
        "Quick map. The field splits by electrolyte chemistry:\n\n- **Sulfides** (Toyota, Samsung SDI): highest conductivity, hardest to manufacture\n- **Oxides** (QuantumScape's ceramic separator): stable but brittle, scale-up risk\n- **Polymers** (Blue Solutions): shipping today, needs heat, lower energy density\n\nThe shared bottlenecks are interface resistance, dendrite suppression, and dry-room cost. Want the technical tradeoffs or the market picture?",
      childrenIds: [u2a, u2b],
    }),

    // Branch A: technical deep dive, branched with Opus for depth.
    [u2a]: mk({
      id: u2a,
      parentId: a1,
      role: "user",
      content:
        "Go deep on sulfide vs oxide electrolytes for a 2030 production timeline.",
      branchLabel: "Technical deep dive",
      modelOverride: {
        provider: "anthropic",
        model: "claude-opus-4-8",
        label: "Claude Opus 4.8",
      },
      childrenIds: [a2a],
    }),
    [a2a]: mk({
      id: a2a,
      parentId: u2a,
      role: "assistant",
      provider: "anthropic",
      model: "claude-opus-4-8",
      content:
        "The core tradeoff, assuming 2030 mass production:\n\n| Factor | Sulfides | Oxides |\n| --- | --- | --- |\n| Ionic conductivity | ~10 mS/cm, rivals liquid | 0.1-1 mS/cm |\n| Processing | Dry room, H2S risk | ~1000 C sintering |\n| Dendrite resistance | Moderate | Strong |\n| Path to $80/kWh | Plausible | Hard below $110 |\n\nThe quiet consensus: sulfides win on physics, oxides win on the safety narrative. The deciding variables for 2030 are interface coatings (LiNbO3-class) and stack pressure requirements. Any cell that needs megapascals of clamping force loses its pack-level energy advantage, so ask every team about stack pressure first.",
      tags: ["electrolytes"],
      comments: [
        {
          id: ids.comment(),
          content:
            "Stack pressure is the under-reported risk. Bring it up in every diligence call.",
          createdAt: now,
        },
      ],
      childrenIds: [],
    }),

    // Branch B: market analysis, branched with GPT.
    [u2b]: mk({
      id: u2b,
      parentId: a1,
      role: "user",
      content: "Same question, but the money side. Who is funded and who ships first?",
      branchLabel: "Market analysis",
      modelOverride: { provider: "openai", model: "gpt-5.2", label: "GPT-5.2" },
      childrenIds: [a2b],
    }),
    [a2b]: mk({
      id: a2b,
      parentId: u2b,
      role: "assistant",
      provider: "openai",
      model: "gpt-5.2",
      content:
        "Funding concentrates in five names:\n\n1. **QuantumScape**: ~$1.5B raised, VW anchor, oxide separator, OEM pilot cells\n2. **Solid Power**: BMW and Ford, sulfide, also sells electrolyte as a product\n3. **Toyota**: in-house sulfide program, targets hybrids first\n4. **Samsung SDI**: pilot line running in Suwon\n5. **ProLogium**: oxide, Mercedes-backed gigafactory in France\n\nPattern worth noting: electrolyte suppliers may capture value before cell makers do, the way materials players did in lithium-ion.",
      tags: ["market", "funding"],
      childrenIds: [u3b],
    }),
    // Synthesis step: pulls the technical branch in via a context link.
    [u3b]: mk({
      id: u3b,
      parentId: a2b,
      role: "user",
      content:
        "Using the linked technical branch plus this one, give me the one-paragraph investment thesis.",
      contextNodeIds: [a2a],
      childrenIds: [a3b],
    }),
    [a3b]: mk({
      id: a3b,
      parentId: u3b,
      role: "assistant",
      provider: "openai",
      model: "gpt-5.2",
      content:
        "Thesis: solid-state is a 2028-2032 story, not a 2026 one. The linked technical branch shows sulfides winning on physics but carrying the worst manufacturing risk, so the asymmetric bet is not cell makers at venture multiples, it is the picks-and-shovels layer: electrolyte supply, interface coatings, and dry-room equipment. Of the cell names, prefer the ones whose chemistry survives the stack-pressure question, and treat any roadmap promising consumer EV cells before 2028 as a marketing document.",
      childrenIds: [],
    }),
  };

  const activePath = [root, u1, a1, u2b, a2b, u3b, a3b];

  const journalEntries: JournalEntry[] = [
    {
      id: ids.journal(),
      type: "branch",
      message: 'Branched as "Technical deep dive" with Claude Opus 4.8',
      nodeId: u2a,
      createdAt: now,
    },
    {
      id: ids.journal(),
      type: "branch",
      message: 'Branched as "Market analysis" with GPT-5.2',
      nodeId: u2b,
      createdAt: now,
    },
    {
      id: ids.journal(),
      type: "context-link",
      message: 'Linked context from "Technical deep dive"',
      nodeId: u3b,
      createdAt: now,
    },
  ];

  return {
    id: ids.chat(),
    title: "Demo: Battery research",
    workspace: "research",
    nodes,
    rootId: root,
    selectedNodeId: a3b,
    activePath,
    collapsedNodeIds: [],
    journalEntries,
    createdAt: now,
    updatedAt: now,
  };
}

// Advanced-programming demo: one real Postgres race condition, two candidate
// fixes explored on separate branches by different models.
export function buildCodingDemoChat(ids: DemoIdFactory): ChatSessionState {
  const now = Date.now();

  const root = ids.node();
  const u1 = ids.node();
  const a1 = ids.node();
  const u2a = ids.node(); // branch A: SKIP LOCKED (Sonnet)
  const a2a = ids.node();
  const u3a = ids.node(); // follow-up on branch A
  const a3a = ids.node();
  const u2b = ids.node(); // branch B: advisory locks (GPT)
  const a2b = ids.node();

  const mk = (n: Omit<ChatNode, "childrenIds" | "createdAt"> &
    Partial<Pick<ChatNode, "childrenIds">>): ChatNode => ({
    childrenIds: [],
    createdAt: now,
    ...n,
  });

  const nodes: Record<string, ChatNode> = {
    [root]: mk({
      id: root,
      parentId: null,
      role: "system",
      content:
        "Demo: an advanced debugging session. A real Postgres job-queue race, with each candidate fix explored on its own branch by a different model so the approaches can be compared side by side. Sample content, no quota spent.",
      childrenIds: [u1],
    }),
    [u1]: mk({
      id: u1,
      parentId: root,
      role: "user",
      content:
        "Our Postgres job queue double-processes tasks under load. Each worker runs:\n\nSELECT id FROM jobs WHERE status = 'pending' ORDER BY created_at LIMIT 1 FOR UPDATE;\nUPDATE jobs SET status = 'running' WHERE id = $1;\n\nTwo workers keep grabbing the same job. Why?",
      codingMode: true,
      childrenIds: [a1],
    }),
    [a1]: mk({
      id: a1,
      parentId: u1,
      role: "assistant",
      provider: "gemini",
      model: "gemini-2.5-flash",
      content:
        "Classic lock-then-race. `FOR UPDATE` makes worker B wait on the row worker A locked, but when A commits, B's `SELECT` re-evaluates and returns that **same row**, because your `UPDATE` runs in a separate statement and B re-reads after the lock clears. The lock serializes access, it does not deduplicate the claim.\n\nTwo standard fixes:\n\n1. `FOR UPDATE SKIP LOCKED` with the claim folded into a single atomic statement\n2. Advisory locks keyed on the job id\n\nWhich one do you want to explore?",
      childrenIds: [u2a, u2b],
    }),

    // Branch A: the SKIP LOCKED rewrite, branched with Sonnet.
    [u2a]: mk({
      id: u2a,
      parentId: a1,
      role: "user",
      content: "Rewrite it with SKIP LOCKED as one atomic statement.",
      branchLabel: "SKIP LOCKED fix",
      modelOverride: {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        label: "Claude Sonnet 4.6",
      },
      codingMode: true,
      childrenIds: [a2a],
    }),
    [a2a]: mk({
      id: a2a,
      parentId: u2a,
      role: "assistant",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      content:
        "```sql\nUPDATE jobs\nSET status = 'running', claimed_at = now()\nWHERE id = (\n  SELECT id FROM jobs\n  WHERE status = 'pending'\n  ORDER BY created_at\n  FOR UPDATE SKIP LOCKED\n  LIMIT 1\n)\nRETURNING id, payload;\n```\n\nOne statement, one transaction: the subquery locks a candidate row, other workers skip past locked rows instead of queueing on them, and the claim is atomic with the lock. Add a partial index so the scan stays cheap as the table grows:\n\n```sql\nCREATE INDEX jobs_pending_idx ON jobs (created_at) WHERE status = 'pending';\n```",
      tags: ["fix"],
      comments: [
        {
          id: ids.comment(),
          content: "Shipped this exact pattern before. Held up at ~2k jobs/s.",
          createdAt: now,
        },
      ],
      childrenIds: [u3a],
    }),
    [u3a]: mk({
      id: u3a,
      parentId: a2a,
      role: "user",
      content: "What happens if a worker crashes after claiming a job?",
      codingMode: true,
      childrenIds: [a3a],
    }),
    [a3a]: mk({
      id: a3a,
      parentId: u3a,
      role: "assistant",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      content:
        "The row stays `running` forever, so add a visibility timeout and sweep stale claims back to pending:\n\n```sql\nUPDATE jobs\nSET status = 'pending', claimed_at = NULL\nWHERE status = 'running'\n  AND claimed_at < now() - interval '5 minutes';\n```\n\nRun it from a cron or fold the condition into the claim query as an `OR`. And make the handlers idempotent: a worker that stalls past the timeout means the job **will** run twice, the timeout only bounds how long a crash can wedge the queue.",
      childrenIds: [],
    }),

    // Branch B: advisory locks, branched with GPT for a second opinion.
    [u2b]: mk({
      id: u2b,
      parentId: a1,
      role: "user",
      content: "Show the advisory-lock version instead.",
      branchLabel: "Advisory locks",
      modelOverride: { provider: "openai", model: "gpt-5.2", label: "GPT-5.2" },
      codingMode: true,
      childrenIds: [a2b],
    }),
    [a2b]: mk({
      id: a2b,
      parentId: u2b,
      role: "assistant",
      provider: "openai",
      model: "gpt-5.2",
      content:
        "```sql\nSELECT id, payload FROM jobs\nWHERE status = 'pending'\n  AND pg_try_advisory_lock(hashtext(id::text))\nORDER BY created_at\nLIMIT 1;\n```\n\nTradeoffs vs SKIP LOCKED: advisory locks live on the **session**, not the transaction, so a crashed connection releases its lock automatically. The costs: you must call `pg_advisory_unlock` on every path, the function call defeats index-only scans, and `hashtext` collisions can skip claimable jobs.\n\nFor a plain queue, SKIP LOCKED is the boring correct answer. Advisory locks earn their keep when the unit of work is not a row, like serializing per-tenant pipelines.",
      tags: ["alternative"],
      childrenIds: [],
    }),
  };

  const activePath = [root, u1, a1, u2a, a2a, u3a, a3a];

  const journalEntries: JournalEntry[] = [
    {
      id: ids.journal(),
      type: "branch",
      message: 'Branched as "SKIP LOCKED fix" with Claude Sonnet 4.6',
      nodeId: u2a,
      createdAt: now,
    },
    {
      id: ids.journal(),
      type: "branch",
      message: 'Branched as "Advisory locks" with GPT-5.2',
      nodeId: u2b,
      createdAt: now,
    },
  ];

  return {
    id: ids.chat(),
    title: "Demo: Race condition hunt",
    workspace: "coding-interview-prep",
    nodes,
    rootId: root,
    selectedNodeId: a3a,
    activePath,
    collapsedNodeIds: [],
    journalEntries,
    createdAt: now,
    updatedAt: now,
  };
}

// Registry the sidebar renders and the store resolves by kind. Order = UI
// order; the first entry is the default (back-compat for loadDemoChat()).
export const DEMO_CHATS: {
  kind: DemoKind;
  label: string;
  build: (ids: DemoIdFactory) => ChatSessionState;
}[] = [
  { kind: "kyoto", label: "Demo: Kyoto trip", build: buildDemoChat },
  { kind: "research", label: "Demo: Deep research", build: buildResearchDemoChat },
  { kind: "coding", label: "Demo: Advanced coding", build: buildCodingDemoChat },
];
