// "Settings" button + dialog. First (and so far only) section: BYOK API keys.
//
// Users paste their own Gemini/OpenAI/Anthropic key; the backend validates it
// with the vendor before storing it sealed, and replies on that key skip the
// daily quota. The key is never shown again — each stored row renders only
// its last-four hint. Saving/removing clears the model-catalog cache (via
// lib/api), so the picker immediately reflects the providers the user's keys
// unlock. Lives behind the account gate like FeedbackButton; hidden entirely
// in local-first stub mode (no backend → nowhere to store keys).

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Settings2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  type ApiKeyInfo,
  type ByokProvider,
  deleteApiKey,
  fetchApiKeys,
  isBackendConfigured,
  saveApiKey,
} from "@/lib/api";

const BYOK_PROVIDERS: {
  id: ByokProvider;
  label: string;
  placeholder: string;
}[] = [
  { id: "gemini", label: "Google Gemini", placeholder: "AIza…" },
  { id: "openai", label: "OpenAI", placeholder: "sk-…" },
  { id: "anthropic", label: "Anthropic", placeholder: "sk-ant-…" },
];

function KeyRow({
  provider,
  label,
  placeholder,
  stored,
  onSaved,
  onRemoved,
}: {
  provider: ByokProvider;
  label: string;
  placeholder: string;
  stored: ApiKeyInfo | undefined;
  onSaved: (keys: ApiKeyInfo[]) => void;
  onRemoved: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const key = draft.trim();
    if (!key || busy) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await saveApiKey(provider, key));
      setDraft("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't save that key — please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteApiKey(provider);
      onRemoved();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't remove that key — please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {stored ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
            ••••{stored.key_hint}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {stored ? (
          <>
            <p className="flex-1 text-xs text-muted-foreground">
              Replies with {label} models run on your key — no daily limit.
            </p>
            <Button
              variant="outline"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => void remove()}
              disabled={busy}
              aria-label={`Remove ${label} key`}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
            </Button>
          </>
        ) : (
          <>
            <Input
              type="password"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              aria-label={`${label} API key`}
              className="h-8 flex-1 text-xs"
            />
            <Button
              size="sm"
              className="h-8 shrink-0"
              onClick={() => void save()}
              disabled={busy || !draft.trim()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </>
        )}
      </div>
      {error ? (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState<ApiKeyInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !isBackendConfigured()) return;
    const abort = new AbortController();
    fetchApiKeys(abort.signal)
      .then((list) => {
        setKeys(list);
        setLoadError(null);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setLoadError("Couldn't load your keys — try reopening settings.");
      });
    return () => abort.abort();
  }, [open]);

  if (!isBackendConfigured()) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Settings2 className="size-4" />
        Settings
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4" />
              Your API keys
            </DialogTitle>
            <DialogDescription>
              Bring your own provider key to run any of its models without a
              daily limit. Keys are checked with the provider, encrypted at
              rest, and never shown again after saving.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {loadError ? (
              <p className="text-xs text-destructive">{loadError}</p>
            ) : null}
            {BYOK_PROVIDERS.map(({ id, label, placeholder }) => (
              <KeyRow
                key={id}
                provider={id}
                label={label}
                placeholder={placeholder}
                stored={keys?.find((k) => k.provider === id)}
                onSaved={setKeys}
                onRemoved={() =>
                  setKeys(
                    (prev) => prev?.filter((k) => k.provider !== id) ?? null,
                  )
                }
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
