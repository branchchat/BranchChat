// ModelPicker — the "Branch with model" dialog.
//
// Shows backend-ranked "Recommended for this task" entries on top (reason +
// badges come from /api/models/recommend — never hardcoded here) and the full
// catalog below, grouped by provider, so the user can always overrule the
// recommendation. Recommendations are driven by the composer draft plus the
// inherited context of the node being branched from.

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

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
import { buildHistoryForNode, useChatStore } from "@/store/chatStore";
import type { ModelChoice } from "@/types/chat";

const RECOMMENDED_COUNT = 3;

const PROVIDER_LABEL: Record<string, string> = {
  gemini: "Google",
  openai: "OpenAI",
  anthropic: "Anthropic",
  ollama: "Local",
};

interface ModelPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Node the branch starts from; its root→node path is the inherited context.
  parentId: string | null;
  // Current composer draft — the strongest "what is the task" signal.
  draft: string;
  onPick: (choice: ModelChoice) => void;
}

function ModelBadges({ badges }: { badges: string[] }) {
  if (badges.length === 0) return null;
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {badges.map((badge) => (
        <Badge key={badge} variant="outline" className="text-[10px]">
          {badge}
        </Badge>
      ))}
    </span>
  );
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] gap-0 overflow-y-auto sm:max-w-md">
        <DialogHeader className="pb-3">
          <DialogTitle>Branch with a model</DialogTitle>
          <DialogDescription>
            The new branch inherits the conversation above the branch point,
            then the model you pick continues from there.
          </DialogDescription>
        </DialogHeader>

        {!isBackendConfigured() ? (
          <p className="py-4 text-sm text-muted-foreground">
            No backend configured (VITE_API_BASE is empty), so replies are
            stubbed locally. Model choice will apply once a backend is set.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {error && <p className="text-sm text-destructive">{error}</p>}

            {recommendations === null ? (
              <p className="text-sm text-muted-foreground italic">
                Finding the best models for this task…
              </p>
            ) : (
              recommended.length > 0 && (
                <section aria-label="Recommended models">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Sparkles className="size-3" />
                    Recommended for this task
                  </h3>
                  <ul className="flex flex-col gap-1">
                    {recommended.map((rec) => (
                      <li key={`${rec.provider}/${rec.model}`}>
                        <button
                          type="button"
                          className="w-full rounded-md border p-2.5 text-left transition-colors hover:bg-accent"
                          onClick={() =>
                            pick(rec.provider, rec.model, rec.label)
                          }
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className="text-sm font-medium">
                              {rec.label}
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                {PROVIDER_LABEL[rec.provider] ?? rec.provider}
                              </span>
                            </span>
                            <ModelBadges badges={rec.badges} />
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {rec.reason}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            )}

            <section aria-label="All models">
              <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">
                All models
              </h3>
              {models === null ? (
                <p className="text-sm text-muted-foreground italic">
                  Loading models…
                </p>
              ) : models.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No AI providers are configured on the server.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {[...byProvider.entries()].map(([provider, group]) => (
                    <div key={provider}>
                      <p className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        {PROVIDER_LABEL[provider] ?? provider}
                      </p>
                      <ul className="flex flex-col gap-1">
                        {group.map((model) => (
                          <li key={model.id}>
                            <button
                              type="button"
                              className="w-full rounded-md border p-2.5 text-left transition-colors hover:bg-accent"
                              onClick={() =>
                                pick(model.provider, model.id, model.label)
                              }
                            >
                              <span className="flex items-start justify-between gap-2">
                                <span className="text-sm font-medium">
                                  {model.label}
                                  {model.is_default && (
                                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                      Default
                                    </span>
                                  )}
                                </span>
                                <ModelBadges badges={model.badges} />
                              </span>
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {model.description}
                              </span>
                            </button>
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
