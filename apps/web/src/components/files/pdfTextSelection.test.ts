import { describe, expect, it } from "vite-plus/test";

import { joinHyphenatedLines } from "./pdfTextSelection";

describe("joinHyphenatedLines", () => {
  it("rejoins a word hyphenated at a line end and keeps the selection on the same text", () => {
    const text = "dass es zusam-\nmenhängt. Diese Annahme";
    const start = text.indexOf("Annahme");
    const joined = joinHyphenatedLines(text, start, start + "Annahme".length);
    expect(joined.text).toBe("dass es zusammenhängt. Diese Annahme");
    expect(joined.text.slice(joined.start, joined.end)).toBe("Annahme");
  });

  it("joins inside a selection and keeps real hyphens", () => {
    const text = "Vokal- und Konso-\nnanten im PDF-\nViewer";
    const joined = joinHyphenatedLines(text, 0, text.length);
    expect(joined.text).toBe("Vokal- und Konsonanten im PDF-\nViewer");
    expect(joined.end).toBe(joined.text.length);
  });
});
