import { describe, expect, it } from "vite-plus/test";

import { locateQuoteInSource } from "./renderedTextSelection";

describe("locateQuoteInSource", () => {
  const source = "# Title\n\nThe result holds\nfor all n.\n\nThe result fails.\n";

  it("maps a rendered quote across a soft line break to its source span", () => {
    expect(
      locateQuoteInSource(source, { text: "holds for all", prefix: "The result ", suffix: " n." }),
    ).toEqual({
      startLine: 3,
      startColumn: 12,
      endLine: 4,
      endColumn: 8,
      text: "holds\nfor all",
    });
  });

  it("uses the surrounding words to pick between repeated quotes", () => {
    expect(
      locateQuoteInSource(source, { text: "The result", prefix: "n. ", suffix: " fails." }),
    ).toMatchObject({ startLine: 6, startColumn: 1 });
  });

  it("gives up on quotes the source does not contain verbatim", () => {
    expect(
      locateQuoteInSource("Some **bold** text", { text: "bold text", prefix: "", suffix: "" }),
    ).toBeNull();
  });
});
