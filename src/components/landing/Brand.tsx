import { cn } from "@/lib/utils";

/** BranchChat mark — a tree whose canopy branches like a mind map. Stroke uses
 *  currentColor so it inverts cleanly inside the dark badge (and anywhere else). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* trunk */}
      <path d="M24 43 V27" />
      {/* lower boughs */}
      <path d="M24 31 C 18.5 30 14.5 26.5 13.5 22" />
      <path d="M24 31 C 29.5 30 33.5 26.5 34.5 22" />
      {/* upper boughs */}
      <path d="M24 28 C 20 24 16.5 19 15 14" />
      <path d="M24 28 C 28 24 31.5 19 33 14" />
      {/* leader */}
      <path d="M24 28 V12" />
      {/* canopy nodes */}
      <circle cx="24" cy="11" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="13.5" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="33.5" cy="13.5" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="13" cy="21.5" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="35" cy="21.5" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="flex size-6 items-center justify-center rounded-md bg-foreground text-background">
        <BrandMark className="size-4" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-foreground">
        BranchChat
      </span>
    </span>
  );
}
