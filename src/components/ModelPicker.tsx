// ModelPicker — the "Branch with model" dialog.
//
// Shows backend-ranked "Recommended" entries on top (reason + badges come
// from /api/models/recommend — never hardcoded here) and the full catalog
// below, grouped by provider, so the user can always overrule the
// recommendation. Recommendations need a task signal, so they only render
// when the composer has a draft; without one the dialog is just the catalog.
//
// Design notes (the rows must read as buttons): every row is a real button
// with cursor-pointer (Tailwind v4 preflight resets buttons to default),
// a hover surface + chevron nudge, and active:scale press feedback. One
// badge pill max per row; the rest of the metadata is a single muted line.
// "All models" is one grouped list with dividers, not stacked cards —
// elevation is reserved for the recommended picks.

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Sparkles } from "lucide-react";

import {
  fetchAvailableModels,
  fetchModelRecommendations,
  isBackendConfigured,
  type ModelInfo,
  type ModelRecommendation,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { buildHistoryForNode, useChatStore } from "@/store/chatStore";
import type { ModelChoice } from "@/types/chat";

const RECOMMENDED_COUNT = 2;

const PROVIDER_LABEL: Record<string, string> = {
  gemini: "Google",
  openai: "OpenAI",
  anthropic: "Anthropic",
  ollama: "Local",
};

// Section-header copy per recommendation task (from the backend's `task`).
const TASK_HEADING: Record<string, string> = {
  coding: "Recommended for coding",
  math: "Recommended for math",
  research: "Recommended for research",
  writing: "Recommended for writing",
  brainstorming: "Recommended for brainstorming",
  multimodal: "Recommended for image work",
  fast: "Recommended for quick answers",
  low_cost: "Recommended for low cost",
  reasoning: "Recommended for complex reasoning",
  general: "Recommended for this task",
};

// The one pill a row is allowed. A "Best for …" badge is only used when it
// matches the task being recommended for — a "Best for research" pill on a
// card recommended for coding reads as a contradiction. Otherwise fall back
// to a neutral trait badge (Fast, Long context, …).
function primaryBadge(badges: string[], task?: string): string | null {
  const best = badges.find((b) => b.toLowerCase().startsWith("best"));
  if (best && (!task || best.toLowerCase().includes(task))) return best;
  return badges.find((b) => !b.toLowerCase().startsWith("best")) ?? best ?? null;
}

// Everything else collapses into one muted "Google · Fast · Low cost" line.
function metaLine(provider: string, badges: string[], pill: string | null): string {
  const rest = badges.filter((b) => b !== pill).slice(0, 3);
  return [PROVIDER_LABEL[provider] ?? provider, ...rest].join(" · ");
}

// Shared row shell: full-width button that looks and feels pressable.
function PickRow({
  onPick,
  title,
  titleTag,
  pill,
  meta,
  detail,
  className,
}: {
  onPick: () => void;
  title: string;
  titleTag?: string;
  pill?: string | null;
  meta: string;
  detail?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left",
        "transition-[background-color,border-color,transform] duration-150 ease-out",
        "hover:bg-accent active:scale-[0.99]",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          {titleTag && (
            <span className="text-muted-foreground shrink-0 text-[11px]">
              {titleTag}
            </span>
          )}
          {pill && (
            <Badge
              variant="secondary"
              className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
            >
              {pill}
            </Badge>
          )}
        </span>
        <span className="text-muted-foreground mt-0.5 block truncate text-xs">
          {meta}
        </span>
        {detail && (
          <span className="text-muted-foreground mt-1 line-clamp-2 block text-xs leading-relaxed">
            {detail}
          </span>
        )}
      </span>
      <ChevronRight
        aria-hidden
        className="text-muted-foreground/40 group-hover:text-foreground size-4 shrink-0 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
      />
    </button>
  );
}

// Loading placeholder shaped like the rows it replaces.
function RowSkeleton({ rows }: { rows: number }) {
  return (
    <div className="divide-border divide-y rounded-lg border" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="animate-pulse space-y-2 px-3 py-3">
          <div className="bg-muted h-3.5 w-2/5 rounded" />
          <div className="bg-muted h-3 w-3/5 rounded" />
        </div>
      ))}
    </div>
  );
}

interface ModelPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Node the branch starts from; its root→node path is the inherited context.
  parentId: string | null;
  // Current composer draft — the strongest "what is the task" signal.
  draft: string;
  onPick: (choice: ModelChoice) => void;
}

export function ModelPicker({
  open,
  onOpenChange,
  parentId,
  draft,
  onPick,
}: ModelPickerProps) {
  const chat = useChatStore((s) => s.chats[s.activeChatId]);
  const codingMode = useChatStore((s) => s.codingMode);

  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [recommendations, setRecommendations] = useState<
    ModelRecommendation[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const hasDraft = draft.trim().length > 0;

  // Cheap signals for the recommender: total inherited-context size and a
  // recent sample, from the SAME path walk the real request will use.
  const contextStats = useMemo(() => {
    if (!open || !chat || !parentId) return { chars: 0, sample: "" };
    const history = buildHistoryForNode(chat.nodes, parentId, codingMode);
    const joined = history.map((m) => m.content).join("\n");
    return { chars: joined.length, sample: joined.slice(-2_000) };
  }, [open, chat, parentId, codingMode]);

  useEffect(() => {
    if (!open || !isBackendConfigured()) return;
    const abort = new AbortController();

    fetchAvailableModels(abort.signal)
      .then((res) => {
        setModels(res.models);
        setError(null); // a retry after a failed load succeeded
      })
      .catch(() => {
        if (!abort.signal.aborted) setError("Could not load models.");
      });

    // Recommendations need a task to rank against. With an empty composer
    // they would all collapse to the same generic copy, so skip the fetch —
    // the recommended section is render-gated on `hasDraft` anyway.
    if (draft.trim()) {
      fetchModelRecommendations(
        {
          message: draft,
          context_sample: contextStats.sample,
          context_chars: contextStats.chars,
          coding_mode: codingMode,
        },
        abort.signal,
      )
        .then(setRecommendations)
        // Recommendations are an enhancement; the manual list still works.
        .catch(() => {
          if (!abort.signal.aborted) setRecommendations([]);
        });
    }

    return () => abort.abort();
    // Deliberately NOT keyed on `draft`: recommendations are computed for the
    // draft as it was when the dialog opened, not re-fetched per keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, codingMode, contextStats]);

  const pick = (provider: string, model: string, label: string) => {
    onPick({ provider, model, label });
    onOpenChange(false);
  };

  const byProvider = useMemo(() => {
    const groups = new Map<string, ModelInfo[]>();
    for (const m of models ?? []) {
      const group = groups.get(m.provider) ?? [];
      group.push(m);
      groups.set(m.provider, group);
    }
    return groups;
  }, [models]);

  const recommended = (recommendations ?? []).slice(0, RECOMMENDED_COUNT);
  const recommendedHeading =
    TASK_HEADING[recommended[0]?.task ?? ""] ?? TASK_HEADING.general;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] gap-0 overflow-y-auto sm:max-w-md">
        <DialogHeader className="pb-4">
          <DialogTitle>Branch with a model</DialogTitle>
          <DialogDescription>
            The new branch keeps the conversation up to this point. The model
            you pick continues from there.
          </DialogDescription>
        </DialogHeader>

        {!isBackendConfigured() ? (
          <p className="text-muted-foreground py-4 text-sm">
            No backend configured (VITE_API_BASE is empty), so replies are
            stubbed locally. Model choice will apply once a backend is set.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {error && <p className="text-destructive text-sm">{error}</p>}

            {hasDraft &&
              (recommendations === null ? (
                <section aria-label="Recommended models">
                  <h3 className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
                    <Sparkles className="size-3" />
                    Recommended
                  </h3>
                  <RowSkeleton rows={RECOMMENDED_COUNT} />
                </section>
              ) : (
                recommended.length > 0 && (
                  <section aria-label="Recommended models">
                    <h3 className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
                      <Sparkles className="size-3" />
                      {recommendedHeading}
                    </h3>
                    <ul className="flex flex-col gap-1.5">
                      {recommended.map((rec) => {
                        const pill = primaryBadge(rec.badges, rec.task);
                        return (
                          <li key={`${rec.provider}/${rec.model}`}>
                            <PickRow
                              onPick={() => pick(rec.provider, rec.model, rec.label)}
                              title={rec.label}
                              pill={pill}
                              meta={metaLine(rec.provider, rec.badges, pill)}
                              detail={rec.reason}
                              className="hover:border-foreground/25 rounded-lg border"
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )
              ))}

            <section aria-label="All models">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-muted-foreground text-xs font-medium">
                  All models
                </h3>
                {!hasDraft && (models?.length ?? 0) > 0 && (
                  <p className="text-muted-foreground/70 text-[11px]">
                    Write a message to get recommendations
                  </p>
                )}
              </div>
              {models === null ? (
                <RowSkeleton rows={3} />
              ) : models.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No AI providers are configured on the server.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {[...byProvider.entries()].map(([provider, group]) => (
                    <div key={provider}>
                      <p className="text-muted-foreground/70 mb-1.5 text-[11px] font-medium tracking-[0.08em] uppercase">
                        {PROVIDER_LABEL[provider] ?? provider}
                      </p>
                      <ul className="divide-border divide-y overflow-hidden rounded-lg border">
                        {group.map((model) => (
                          <li key={model.id}>
                            <PickRow
                              onPick={() => pick(model.provider, model.id, model.label)}
                              title={model.label}
                              titleTag={model.is_default ? "Default" : undefined}
                              // Provider is the group header; the row meta is
                              // just the model's traits.
                              meta={model.badges.slice(0, 3).join(" · ")}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
