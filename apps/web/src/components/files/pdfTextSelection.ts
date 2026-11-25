import { createAssistantTextSelector } from "@t3tools/shared/assistantCitations";

export type PdfTextQuote = {
  /** 1-based page number. */
  readonly page: number;
  readonly text: string;
  readonly prefix: string;
  readonly suffix: string;
};

// pdf.js ends each text line with a <br>, which Range#toString drops.
function layerText(node: Node): string {
  let text = "";
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) text += (child as Text).data;
    else if (child.nodeName === "BR") text += "\n";
    else text += layerText(child);
  }
  return text;
}

// A hyphen ending a line before a lowercase letter split one word: "zusam-" / "menhängt".
const LINE_END_HYPHEN = /(?<=\p{L})-\n(?=\p{Ll})/gu;

/** Rejoins words a justified PDF hyphenated across lines, moving `start` and `end` with the text. */
export function joinHyphenatedLines(text: string, start: number, end: number) {
  let removedBeforeStart = 0;
  let removedBeforeEnd = 0;
  for (const match of text.matchAll(LINE_END_HYPHEN)) {
    const removed = match[0].length;
    if (match.index + removed <= start) removedBeforeStart += removed;
    if (match.index + removed <= end) removedBeforeEnd += removed;
  }
  return {
    text: text.replace(LINE_END_HYPHEN, ""),
    start: start - removedBeforeStart,
    end: end - removedBeforeEnd,
  };
}

function textLayerOf(node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return element?.closest<HTMLElement>("[data-pdf-text-layer]") ?? null;
}

/** Reads a selection inside one rendered PDF page; selections spanning pages are not quotable. */
export function capturePdfTextSelection(
  viewport: HTMLElement,
  selection: Selection | null,
): { quote: PdfTextQuote; range: Range } | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const layer = textLayerOf(range.startContainer);
  if (!layer || !viewport.contains(layer) || textLayerOf(range.endContainer) !== layer) {
    return null;
  }
  const page = Number(layer.parentElement?.dataset.pdfPage);
  if (!Number.isSafeInteger(page) || page < 1) return null;
  const before = document.createRange();
  before.setStart(layer, 0);
  before.setEnd(range.startContainer, range.startOffset);
  const start = layerText(before.cloneContents()).length;
  const end = start + layerText(range.cloneContents()).length;
  const joined = joinHyphenatedLines(layerText(layer), start, end);
  const selector = createAssistantTextSelector(joined.text, joined.start, joined.end);
  if (!selector) return null;
  return {
    quote: { page, text: selector.text, prefix: selector.prefix, suffix: selector.suffix },
    range,
  };
}
