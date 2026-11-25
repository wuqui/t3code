// @effect-diagnostics globalTimers:off - This isolated Electron preload does not run inside an Effect runtime.
import { ipcRenderer } from "electron";
import {
  findQuoteInCompactText,
  QUOTE_MARKS_GUEST_STYLE,
  QUOTE_MARKS_HIGHLIGHT,
  runQuoteMarks,
  type QuoteMarkQuote,
} from "@t3tools/shared/quoteMarks";

import { QUOTE_MARKS_GUEST_CHANNEL, QUOTE_MARKS_HOST_CHANNEL } from "./GuestProtocol.ts";

const isQuote = (value: unknown): value is QuoteMarkQuote => {
  if (typeof value !== "object" || value === null) return false;
  const { id, text, prefix, suffix } = value as Record<string, unknown>;
  return [id, text, prefix, suffix].every((field) => typeof field === "string");
};

/** Highlights the quotes the host's comments are on and reports where they are. */
export function installQuoteMarks(): void {
  const marker = runQuoteMarks({
    root: () => document.body,
    highlightName: QUOTE_MARKS_HIGHLIGHT,
    style: QUOTE_MARKS_GUEST_STYLE,
    find: findQuoteInCompactText,
    report: (rects) => ipcRenderer.sendToHost(QUOTE_MARKS_HOST_CHANNEL, { rects }),
  });
  ipcRenderer.on(QUOTE_MARKS_GUEST_CHANNEL, (_event, params: unknown) => {
    const quotes = (params as { quotes?: unknown } | null)?.quotes;
    if (!Array.isArray(quotes)) return;
    const set = () => marker.set(quotes.filter(isQuote));
    if (document.body) set();
    else document.addEventListener("DOMContentLoaded", set, { once: true });
  });
}
