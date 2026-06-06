import { GitBranch } from "lucide-react";

import { cn } from "@/lib/utils";

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="flex size-6 items-center justify-center rounded-md bg-foreground text-background">
        <GitBranch className="size-3.5" strokeWidth={2.2} />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-foreground">
        BranchChat
      </span>
    </span>
  );
}
