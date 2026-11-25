// @effect-diagnostics globalTimers:off - This isolated Electron preload does not run inside an Effect runtime.
import { ipcRenderer } from "electron";

import { TEXT_SELECTION_HOST_CHANNEL } from "./GuestProtocol.ts";

const MAX_TEXT = 8_001;
const CONTEXT = 32;

const flat = (text: string) => text.replace(/\s+/g, " ");

const HIDDEN_TEXT_PARENTS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
// Blocks read as separate words; Range#toString runs "Title" and "Body" together as "TitleBody".
const BLOCK_ELEMENTS =
  /^(?:ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|DD|DIV|DL|DT|FIGCAPTION|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|PRE|SECTION|TABLE|TD|TH|TR|UL)$/;

/** Range text without script and style contents, with a break where each block starts. */
function visibleText(range: Range): string {
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        return HIDDEN_TEXT_PARENTS.has((node as Element).tagName)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      }
      return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      // Only a block that starts inside the range separates text in it.
      if (BLOCK_ELEMENTS.test((node as Element).tagName) && range.comparePoint(node, 0) === 0) {
        text += "\n";
      }
      continue;
    }
    const data = (node as Text).data;
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : data.length;
    text += data.slice(start, end);
  }
  return text;
}

function report(params: object): void {
  ipcRenderer.sendToHost(TEXT_SELECTION_HOST_CHANNEL, params);
}

function readSelection(): object {
  const selection = window.getSelection();
  const text =
    selection && selection.rangeCount > 0 && !selection.isCollapsed ? String(selection) : "";
  if (!text.trim()) return { text: "" };
  const range = selection!.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  let prefix = "";
  let suffix = "";
  try {
    const before = document.createRange();
    before.selectNodeContents(document.body);
    before.setEnd(range.startContainer, range.startOffset);
    prefix = flat(visibleText(before)).slice(-CONTEXT);
    const after = document.createRange();
    after.selectNodeContents(document.body);
    after.setStart(range.endContainer, range.endOffset);
    suffix = flat(visibleText(after)).slice(0, CONTEXT);
  } catch {
    // A selection outside the body (an input, a shadow root) is reported without context.
  }
  return {
    text: text.slice(0, MAX_TEXT),
    prefix,
    suffix,
    rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
    pageUrl: location.href,
    pageTitle: document.title,
  };
}

/**
 * Reports the text the reader selects to the hosting <webview>, which offers a comment on it.
 * `isBusy` holds reports back while an annotation session owns the page.
 */
export function installTextSelectionReport(isBusy: () => boolean): void {
  let reported = false;
  const send = () => {
    if (isBusy()) return;
    const params = readSelection();
    reported = "rect" in params;
    report(params);
  };
  const clear = () => {
    if (!reported) return;
    reported = false;
    report({ text: "" });
  };
  window.addEventListener("mouseup", (event) => {
    if (event.button === 0) setTimeout(send, 0);
  });
  window.addEventListener("keyup", (event) => {
    if (event.shiftKey || event.key === "Shift") send();
  });
  document.addEventListener("selectionchange", () => {
    if (window.getSelection()?.isCollapsed ?? true) clear();
  });
  window.addEventListener("scroll", clear, { capture: true, passive: true });
}
