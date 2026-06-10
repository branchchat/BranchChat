import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { usePostHog } from "@posthog/react";

import { COOKIE_SETTINGS_EVENT, getConsent, setConsent } from "@/lib/consent";

// Bottom-anchored consent banner. Shows on first visit (no stored choice) and
// whenever `openCookieSettings()` is dispatched (footer "Cookie settings").
// Accept -> PostHog opt-in (analytics + session replay start); Decline ->
// opt-out (nothing is captured).
export function CookieConsent() {
  const posthog = usePostHog();
  // Show on first visit (no stored choice). Read once via a lazy initializer so
  // we don't setState synchronously inside the effect (cascading renders).
  const [visible, setVisible] = useState(() => getConsent() === null);

  useEffect(() => {
    const open = () => setVisible(true);
    window.addEventListener(COOKIE_SETTINGS_EVENT, open);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, open);
  }, []);

  if (!visible) return null;

  const choose = (accepted: boolean) => {
    setConsent(accepted ? "accepted" : "declined");
    if (accepted) posthog?.opt_in_capturing();
    else posthog?.opt_out_capturing();
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4">
      <div className="bc-rise mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border bg-background/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          We use cookies and privacy-first analytics to understand how
          BranchChat is used and to improve it. Your in-app chat content is
          never recorded. See our{" "}
          <Link
            to="/privacy"
            className="font-medium text-foreground underline underline-offset-4 transition-opacity hover:opacity-80"
          >
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose(false)}
            className="bc-press h-9 rounded-xl border px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary/60"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => choose(true)}
            className="bc-press h-9 rounded-xl bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
