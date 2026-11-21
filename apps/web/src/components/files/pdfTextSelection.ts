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
  const selector = createAssistantTextSelector(layerText(layer), start, end);
  if (!selector) return null;
  return {
    quote: { page, text: selector.text, prefix: selector.prefix, suffix: selector.suffix },
    range,
  };
}
