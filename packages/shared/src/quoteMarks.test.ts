import { describe, expect, it, vi } from "vite-plus/test";

import {
  findQuoteInCompactText,
  QUOTE_MARKS_GUEST_STYLE,
  QUOTE_MARKS_HIGHLIGHT,
  quoteMarksFrameScript,
  runQuoteMarks,
} from "./quoteMarks.ts";

const compact = (text: string) => text.replace(/\s+/g, "");

describe("findQuoteInCompactText", () => {
  it("finds a quote whose words a page splits across lines and blocks", () => {
    const page = compact("Title\nThe result holds\nfor all n.");
    expect(
      findQuoteInCompactText(page, { text: "holds for all", prefix: "result ", suffix: " n." }),
    ).toEqual({ start: page.indexOf("holdsforall"), end: page.indexOf("holdsforall") + 11 });
  });

  it("picks the repeat whose surrounding text matches", () => {
    const page = compact("The result holds. The result fails.");
    const match = findQuoteInCompactText(page, {
      text: "The result",
      prefix: "holds. ",
      suffix: " fails.",
    });
    expect(match?.start).toBe(page.lastIndexOf("Theresult"));
  });

  it("finds nothing when context cannot tell repeats apart", () => {
    expect(
      findQuoteInCompactText(compact("same same"), { text: "same", prefix: "", suffix: "" }),
    ).toBeNull();
  });
});

describe("quoteMarksFrameScript", () => {
  it("is a script that runs on its own", () => {
    expect(() => new Function(quoteMarksFrameScript())).not.toThrow();
  });
});

describe("runQuoteMarks", () => {
  it("installs and removes guest styles via adoptedStyleSheets without injecting <style>", () => {
    const createElement = vi.fn();
    const adoptedStyleSheets: Array<{ text: string }> = [];
    class FakeStyleSheet {
      text = "";
      replaceSync(text: string) {
        this.text = text;
      }
    }
    const fakeDocument = {
      head: null,
      documentElement: { append: vi.fn() },
      adoptedStyleSheets,
      createElement,
      querySelector: vi.fn(() => null),
      createRange: vi.fn(),
      createTreeWalker: vi.fn(() => ({ nextNode: () => null })),
    };
    const root = { nodeType: 1, tagName: "BODY" };
    vi.stubGlobal("document", fakeDocument);
    vi.stubGlobal("CSSStyleSheet", FakeStyleSheet);
    vi.stubGlobal(
      "MutationObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("addEventListener", vi.fn());
    vi.stubGlobal("removeEventListener", vi.fn());
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    try {
      const marker = runQuoteMarks({
        root: () => root,
        highlightName: QUOTE_MARKS_HIGHLIGHT,
        style: QUOTE_MARKS_GUEST_STYLE,
        find: findQuoteInCompactText,
        report: vi.fn(),
      });
      marker.set([{ id: "q1", text: "hello", prefix: "", suffix: "" }]);
      expect(createElement).not.toHaveBeenCalled();
      expect(fakeDocument.adoptedStyleSheets).toHaveLength(1);
      expect(fakeDocument.adoptedStyleSheets[0]?.text).toBe(QUOTE_MARKS_GUEST_STYLE);
      marker.dispose();
      expect(fakeDocument.adoptedStyleSheets).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
