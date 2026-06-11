// Shared Markdown renderer for assistant replies.
//
// Models are told (system prompt) to answer in Markdown, and the 4.6+/GPT-5
// generation also writes LaTeX math by default — until now both rendered as
// raw symbols. One component so the canvas nodes, the Show-more popup, the
// Read view, and Compare all format identically: GFM (tables, strikethrough,
// task lists), math via KaTeX, compact spacing tuned for chat bubbles.
//
// User/system text deliberately does NOT go through this — people expect
// their own asterisks to stay asterisks.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

import { cn } from "@/lib/utils";

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Compact chat-bubble typography: tight block margins, no outer ones.
        "space-y-2 text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        // Headings scale down — a reply's "# Title" shouldn't shout.
        "[&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-medium",
        // Lists.
        "[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5",
        // Inline code + fenced blocks.
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        // Links, quotes, rules, tables.
        "[&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-foreground",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&_hr]:border-border",
        "[&_table]:w-full [&_table]:text-left [&_th]:border-b [&_th]:border-border [&_th]:pb-1 [&_th]:pr-3 [&_th]:font-medium [&_td]:border-b [&_td]:border-border/50 [&_td]:py-1 [&_td]:pr-3",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
