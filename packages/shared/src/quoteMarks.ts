/**
 * Marks for comments on quoted text, shared by the app and by pages that cannot import it.
 * `findQuoteInCompactText` and `runQuoteMarks` reference nothing outside themselves, so guest
 * pages run them from their source text (see `quoteMarksGuestSource`).
 */

export interface QuoteMarkQuote {
  readonly id: string;
  readonly text: string;
  readonly prefix: string;
  readonly suffix: string;
}

/** The last line of a marked quote, in the viewport pixels of the page it is in. */
export interface QuoteMarkRect {
  readonly id: string;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * Finds `quote` in `compact`, text with its whitespace removed, so line and block breaks between
 * the quote's words do not matter. The longest matching context picks between repeats; a tie
 * finds nothing rather than marking the wrong one.
 */
export function findQuoteInCompactText(
  compact: string,
  quote: { readonly text: string; readonly prefix: string; readonly suffix: string },
): { start: number; end: number } | null {
  const strip = (text: string) => text.replace(/\s+/g, "");
  const needle = strip(quote.text);
  if (!needle) return null;
  const prefix = strip(quote.prefix);
  const suffix = strip(quote.suffix);
  let best: { start: number; end: number } | null = null;
  let bestScore = -1;
  let tied = false;
  for (
    let start = compact.indexOf(needle);
    start !== -1;
    start = compact.indexOf(needle, start + 1)
  ) {
    const end = start + needle.length;
    let before = 0;
    while (
      before < prefix.length &&
      compact[start - 1 - before] === prefix[prefix.length - 1 - before]
    ) {
      before += 1;
    }
    let after = 0;
    while (after < suffix.length && compact[end + after] === suffix[after]) after += 1;
    const score = before + after;
    if (score > bestScore) {
      best = { start, end };
      bestScore = score;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  }
  return tied ? null : best;
}

// The DOM as `runQuoteMarks` uses it. Typed here because packages without the DOM library
// (the server builds guest scripts from this file) still typecheck it.
interface MarkNode {
  readonly nodeType: number;
}
interface MarkText extends MarkNode {
  readonly data: string;
}
interface MarkElement extends MarkNode {
  readonly tagName: string;
}
interface MarkRange {
  setStart(node: MarkText, offset: number): void;
  setEnd(node: MarkText, offset: number): void;
  getClientRects(): ArrayLike<{ left: number; top: number; right: number; bottom: number }>;
}
interface MarkHighlight {
  readonly size: number;
  add(range: MarkRange): unknown;
  delete(range: MarkRange): boolean;
}
interface MarkStyle {
  readonly dataset: Record<string, string | undefined>;
  textContent: string | null;
}
interface MarkStyleSheet {
  replaceSync(text: string): void;
}
interface MarkDom {
  readonly document: {
    readonly head: { append(node: MarkStyle): void } | null;
    readonly documentElement: { append(node: MarkStyle): void };
    adoptedStyleSheets?: MarkStyleSheet[];
    createRange(): MarkRange;
    createTreeWalker(
      root: MarkElement,
      whatToShow: number,
      filter: { acceptNode(node: MarkNode): number },
    ): { nextNode(): MarkNode | null };
    querySelector(selectors: string): unknown;
    createElement(tagName: "style"): MarkStyle;
  };
  readonly CSSStyleSheet?: new () => MarkStyleSheet;
  readonly CSS?: {
    readonly highlights?: {
      get(name: string): MarkHighlight | undefined;
      set(name: string, highlight: MarkHighlight): unknown;
      delete(name: string): boolean;
    };
  };
  readonly Highlight?: new () => MarkHighlight;
  readonly MutationObserver: new (callback: () => void) => {
    observe(target: MarkElement, options: Record<string, boolean>): void;
    disconnect(): void;
  };
  addEventListener(type: string, listener: () => void, options?: unknown): void;
  removeEventListener(type: string, listener: () => void, options?: unknown): void;
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(handle: number): void;
}

/**
 * Highlights quotes under `root` and reports where each one's last line is whenever that changes.
 * `style` is injected for pages without the app's stylesheet.
 */
export function runQuoteMarks(options: {
  readonly root: () => MarkElement | null;
  readonly highlightName: string;
  readonly style?: string | undefined;
  readonly find: typeof findQuoteInCompactText;
  readonly report: (rects: QuoteMarkRect[]) => void;
}) {
  const dom = globalThis as unknown as MarkDom;
  const { document } = dom;
  const registry = dom.Highlight ? (dom.CSS?.highlights ?? null) : null;
  // Node and NodeFilter constants, inlined so the guest copy needs nothing else.
  const ELEMENT_NODE = 1;
  const TEXT_NODE = 3;
  const SHOW_ELEMENT_AND_TEXT = 1 | 4;
  const FILTER_ACCEPT = 1;
  const FILTER_REJECT = 2;
  let quotes: readonly QuoteMarkQuote[] = [];
  let ranges: { id: string; range: MarkRange }[] = [];
  let stale = true;
  let frame = 0;
  let lastReport = "";
  let observed: MarkElement | null = null;
  let styleSheet: MarkStyleSheet | null = null;
  const mutations = new dom.MutationObserver(() => invalidate());

  const highlight = () => {
    if (!registry || !dom.Highlight) return null;
    const existing = registry.get(options.highlightName);
    if (existing) return existing;
    const created = new dom.Highlight();
    registry.set(options.highlightName, created);
    return created;
  };
  const clearRanges = () => {
    const shared = registry?.get(options.highlightName);
    for (const { range } of ranges) shared?.delete(range);
    if (shared && shared.size === 0) registry?.delete(options.highlightName);
    ranges = [];
  };
  const resolve = (root: MarkElement) => {
    clearRanges();
    let compact = "";
    const nodes: MarkText[] = [];
    const offsets: number[] = [];
    const walker = document.createTreeWalker(root, SHOW_ELEMENT_AND_TEXT, {
      acceptNode: (node) =>
        node.nodeType === ELEMENT_NODE &&
        /^(?:SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/.test((node as MarkElement).tagName)
          ? FILTER_REJECT
          : FILTER_ACCEPT,
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType !== TEXT_NODE) continue;
      const data = (node as MarkText).data;
      for (let index = 0; index < data.length; index += 1) {
        if (/\s/.test(data[index]!)) continue;
        compact += data[index];
        nodes.push(node as MarkText);
        offsets.push(index);
      }
    }
    const shared = highlight();
    for (const quote of quotes) {
      const match = options.find(compact, quote);
      if (!match) continue;
      const range = document.createRange();
      range.setStart(nodes[match.start]!, offsets[match.start]!);
      range.setEnd(nodes[match.end - 1]!, offsets[match.end - 1]! + 1);
      ranges.push({ id: quote.id, range });
      shared?.add(range);
    }
  };
  const measure = () => {
    frame = 0;
    const root = options.root();
    if (stale && root) {
      stale = false;
      resolve(root);
    }
    const rects: QuoteMarkRect[] = [];
    for (const { id, range } of ranges) {
      const lines = range.getClientRects();
      const line = lines[lines.length - 1];
      if (line) {
        rects.push({ id, left: line.left, top: line.top, right: line.right, bottom: line.bottom });
      }
    }
    const key = JSON.stringify(rects);
    if (key === lastReport) return;
    lastReport = key;
    options.report(rects);
  };
  const schedule = () => {
    if (frame === 0) frame = dom.requestAnimationFrame(measure);
  };
  const invalidate = () => {
    stale = true;
    schedule();
  };
  const stop = () => {
    if (!observed) return;
    observed = null;
    mutations.disconnect();
    dom.removeEventListener("scroll", schedule, true);
    dom.removeEventListener("resize", schedule);
    dom.cancelAnimationFrame(frame);
    frame = 0;
  };

  return {
    set(next: readonly QuoteMarkQuote[]) {
      quotes = next;
      // A host that starts listening (a frame it now shows) gets the marks again.
      lastReport = "";
      const root = options.root();
      if (quotes.length === 0 || !root) {
        stop();
        clearRanges();
        lastReport = "[]";
        options.report([]);
        return;
      }
      if (observed !== root) {
        stop();
        observed = root;
        mutations.observe(root, { childList: true, subtree: true, characterData: true });
        dom.addEventListener("scroll", schedule, { capture: true, passive: true });
        dom.addEventListener("resize", schedule);
        if (options.style && !styleSheet) {
          if (dom.CSSStyleSheet && Array.isArray(document.adoptedStyleSheets)) {
            // Constructed sheets are exempt from the page's CSP style-src; <style> elements are not.
            const sheet = new dom.CSSStyleSheet();
            sheet.replaceSync(options.style);
            document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
            styleSheet = sheet;
          } else if (!document.querySelector("style[data-t3-quote-marks]")) {
            const style = document.createElement("style");
            style.dataset.t3QuoteMarks = "";
            style.textContent = options.style;
            (document.head ?? document.documentElement).append(style);
          }
        }
      }
      invalidate();
    },
    dispose() {
      stop();
      clearRanges();
      if (styleSheet && Array.isArray(document.adoptedStyleSheets)) {
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
          (sheet) => sheet !== styleSheet,
        );
        styleSheet = null;
      }
    },
  };
}

export const QUOTE_MARKS_HIGHLIGHT = "t3-quote-comment";
export const QUOTE_MARKS_GUEST_STYLE = `::highlight(${QUOTE_MARKS_HIGHLIGHT}){background-color:rgb(234 120 40 / 30%)}`;
/** Host to guest: `{ quotes: QuoteMarkQuote[] }`. */
export const QUOTE_MARKS_SET_METHOD = "t3/notifications/quote-marks-set";
/** Guest to host: `{ rects: QuoteMarkRect[] }`. */
export const QUOTE_MARKS_REPORT_METHOD = "t3/notifications/quote-marks";

/** A script body that runs quote marks in a framed page, talking to its parent by postMessage. */
export function quoteMarksFrameScript(): string {
  return `(function(){var p=window.parent;if(p===window)return;var m=(${runQuoteMarks.toString()})({root:function(){return document.body},highlightName:${JSON.stringify(QUOTE_MARKS_HIGHLIGHT)},style:${JSON.stringify(QUOTE_MARKS_GUEST_STYLE)},find:${findQuoteInCompactText.toString()},report:function(r){p.postMessage({jsonrpc:"2.0",method:${JSON.stringify(QUOTE_MARKS_REPORT_METHOD)},params:{rects:r}},"*")}});addEventListener("message",function(e){var d=e.data,q=d&&d.params;if(e.source!==p||!d||d.jsonrpc!=="2.0"||d.method!==${JSON.stringify(QUOTE_MARKS_SET_METHOD)}||!q||!Array.isArray(q.quotes))return;m.set(q.quotes.filter(function(x){return x&&typeof x.id==="string"&&typeof x.text==="string"&&typeof x.prefix==="string"&&typeof x.suffix==="string"}))});})();`;
}

/** A guest's report of where its marks are, or `undefined` for anything else. */
export function readQuoteMarkRects(data: unknown): QuoteMarkRect[] | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const rects = (data as { rects?: unknown }).rects;
  if (!Array.isArray(rects)) return undefined;
  return rects.filter((rect): rect is QuoteMarkRect => {
    if (typeof rect !== "object" || rect === null) return false;
    const { id, left, top, right, bottom } = rect as Record<string, unknown>;
    return (
      typeof id === "string" &&
      [left, top, right, bottom].every((edge) => typeof edge === "number" && Number.isFinite(edge))
    );
  });
}
