import { describe, expect, it } from "vite-plus/test";

import { readWebTextSelection } from "./webTextSelection";

describe("readWebTextSelection", () => {
  const rect = { left: 1, top: 2, right: 3, bottom: 4 };

  it("reads a selection, a cleared selection, and rejects malformed reports", () => {
    expect(
      readWebTextSelection({
        text: "word",
        prefix: "a",
        suffix: "b",
        rect,
        pageUrl: "https://example.com/a",
        pageTitle: " ",
      }),
    ).toEqual({
      text: "word",
      prefix: "a",
      suffix: "b",
      rect,
      pageUrl: "https://example.com/a",
      pageTitle: null,
    });
    expect(readWebTextSelection({ text: "" })).toBeNull();
    expect(readWebTextSelection({ text: "word", rect })).toBeUndefined();
  });
});
