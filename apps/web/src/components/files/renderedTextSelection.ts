import { createAssistantTextSelector } from "@t3tools/shared/assistantCitations";
import {
  buildFileReviewComment,
  buildQuoteReviewComment,
  type ReviewCommentContext,
} from "~/reviewCommentContext";

export type RenderedTextQuote = {
  readonly text: string;
  readonly prefix: string;
  readonly suffix: string;
};

function renderedText(node: Node): string {
  let text = "";
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) text += (child as Text).data;
    else if (child.nodeName === "BR") text += "\n";
    else text += renderedText(child);
  }
  return text;
}

/** Reads a selection inside rendered content, with surrounding text to tell repeats apart. */
export function captureRenderedTextSelection(
  root: HTMLElement,
  selection: Selection | null,
): { quote: RenderedTextQuote; range: Range } | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const before = document.createRange();
  before.setStart(root, 0);
  before.setEnd(range.startContainer, range.startOffset);
  const start = renderedText(before.cloneContents()).length;
  const end = start + renderedText(range.cloneContents()).length;
  const selector = createAssistantTextSelector(renderedText(root), start, end);
  if (!selector) return null;
  return {
    quote: { text: selector.text, prefix: selector.prefix, suffix: selector.suffix },
    range,
  };
}

export type SourceSpan = {
  /** 1-based lines; columns are 1-based and the end column is exclusive. */
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly text: string;
};

function position(source: string, offset: number) {
  const before = source.slice(0, offset);
  const line = before.split("\n").length;
  return { line, column: offset - (before.lastIndexOf("\n") + 1) + 1 };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds rendered text in the file it was rendered from. Markup inside the quote (emphasis, links)
 * defeats the search, and a quote repeated without telling context is not guessed at.
 */
export function locateQuoteInSource(source: string, quote: RenderedTextQuote): SourceSpan | null {
  const words = quote.text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const pattern = new RegExp(words.map(escapeRegExp).join(String.raw`\s+`), "g");
  const matches = Array.from(source.matchAll(pattern));
  if (matches.length === 0) return null;
  let match = matches.length === 1 ? matches[0]! : null;
  if (!match) {
    const before = quote.prefix.trim().split(/\s+/).at(-1) ?? "";
    const after = quote.suffix.trim().split(/\s+/)[0] ?? "";
    const fitting = matches.filter((candidate) => {
      const index = candidate.index;
      return (
        (!before || source.slice(Math.max(0, index - 200), index).includes(before)) &&
        (!after ||
          source
            .slice(index + candidate[0].length, index + candidate[0].length + 200)
            .includes(after))
      );
    });
    if (fitting.length !== 1) return null;
    match = fitting[0]!;
  }
  const start = position(source, match.index);
  const end = position(source, match.index + match[0].length);
  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
    text: match[0],
  };
}

/** A comment on rendered text, pinned to its source span when the source contains it verbatim. */
export function renderedQuoteReviewComment(input: {
  id: string;
  filePath: string;
  source: string | undefined;
  quote: RenderedTextQuote;
  comment: string;
}): ReviewCommentContext {
  const span = input.source === undefined ? null : locateQuoteInSource(input.source, input.quote);
  return span && input.source !== undefined
    ? buildFileReviewComment({
        id: input.id,
        filePath: input.filePath,
        startLine: span.startLine,
        endLine: span.endLine,
        text: input.comment,
        contents: input.source,
        quote: { text: span.text, startColumn: span.startColumn, endColumn: span.endColumn },
      })
    : buildQuoteReviewComment({
        id: input.id,
        filePath: input.filePath,
        text: input.comment,
        quote: input.quote,
      });
}
