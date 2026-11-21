import type { KnownComposerContextRecord } from "@t3tools/contracts";
import { useGT } from "gt-react";
import { use } from "react";
import { textDirection } from "~/textDirection";
import { cn } from "~/lib/utils";
import { isWebQuoteReviewComment, parseQuoteReviewComment } from "~/reviewCommentContext";
import { useRightPanelStore } from "~/rightPanelStore";
import { TimelineRowCtx } from "./timelineRowContext";

const flat = (text: string) => text.replace(/\s+/g, " ");

/**
 * A comment on text selected in a file, shown like a quoted response: the file and place, the
 * quote in its context, then the comment. Clicking the card opens the file.
 */
export function TextQuoteCommentCard(props: {
  record: Extract<KnownComposerContextRecord, { kind: "review-comment" }>;
  copyMarkdown: string;
  leading: boolean;
  trailing: boolean;
}) {
  const gt = useGT();
  const ctx = use(TimelineRowCtx);
  const quote = parseQuoteReviewComment(props.record);
  if (!quote) return null;
  const web = isWebQuoteReviewComment(props.record);
  const name = web
    ? webPageName(props.record.filePath)
    : (props.record.filePath.split(/[\\/]/).at(-1) ?? props.record.filePath);
  const place = /^(?:p\. \d+|L\d+)/.test(props.record.rangeLabel) ? props.record.rangeLabel : null;
  const title = web ? `${props.record.rangeLabel} · ${name}` : place ? `${name} · ${place}` : name;
  const line =
    props.record.sectionTitle === "PDF comment" ? undefined : props.record.startIndex + 1;
  const comment = props.record.text.trim();
  return (
    <span
      data-markdown-copy={props.copyMarkdown}
      className={cn("block", !props.leading && "mt-[0.65rem]", !props.trailing && "mb-[0.65rem]")}
    >
      <button
        type="button"
        disabled={web || !ctx.threadRef}
        aria-label={gt("Open {file}", { file: title })}
        data-thread-find-ignore
        className="block w-full min-w-0 rounded-lg bg-black/10 px-2.5 py-1.5 text-start text-sm text-muted-foreground wrap-break-word hover:bg-black/14 focus-visible:outline-2 focus-visible:outline-ring dark:bg-black/35 dark:hover:bg-black/50"
        onClick={() => {
          if (ctx.threadRef) {
            useRightPanelStore.getState().openFile(ctx.threadRef, props.record.filePath, line);
          }
        }}
      >
        <span className="block truncate text-xs font-medium text-foreground/80" dir="auto">
          {title}
        </span>
        <span className="line-clamp-2" dir={textDirection(quote.text)}>
          {quote.prefix ? `…${flat(quote.prefix)} ` : null}
          <mark className="rounded-sm bg-foreground/12 px-0.5 text-foreground">
            {flat(quote.text)}
          </mark>
          {quote.suffix ? ` ${flat(quote.suffix)}…` : null}
        </span>
      </button>
      {comment ? (
        <span className="mt-1.5 block whitespace-pre-wrap" dir={textDirection(comment)}>
          {comment}
        </span>
      ) : null}
    </span>
  );
}

function webPageName(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}
