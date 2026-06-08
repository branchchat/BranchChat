// Sample branching conversation for the "Load demo conversation" action.
//
// Demonstrates the core idea — one node with two alternate branches plus a
// continuation — so a new or returning user can see what BranchChat does
// without spending real quota. Kept as a pure builder (id factories injected
// by the store) so it reuses the store's id scheme and stays testable.

import type { ChatNode, ChatSessionState, JournalEntry } from "@/types/chat";

export interface DemoIdFactory {
  node: () => string;
  chat: () => string;
  journal: () => string;
}

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
      tags: ["itinerary"],
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
