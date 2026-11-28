import { describe, expect, it } from "vite-plus/test";

import { userBlockquotesToMarkdown } from "./userMessageBlockquotes";

describe("userBlockquotesToMarkdown", () => {
  it("turns a pasted blockquote into a Markdown quote", () => {
    expect(
      userBlockquotesToMarkdown("<blockquote> How it works: one model. </blockquote>\nDoes T3?"),
    ).toBe("> How it works: one model.\n\nDoes T3?");
  });

  it("quotes every line of a multi-line blockquote", () => {
    expect(userBlockquotesToMarkdown("Intro\n<blockquote>\nfirst\n\nsecond\n</blockquote>")).toBe(
      "Intro\n\n> first\n>\n> second",
    );
  });

  it("leaves code, inline mentions and unclosed tags alone", () => {
    const fenced = "```html\n<blockquote>x</blockquote>\n```";
    expect(userBlockquotesToMarkdown(fenced)).toBe(fenced);
    const inline = "Use `<blockquote>x</blockquote>` here";
    expect(userBlockquotesToMarkdown(inline)).toBe(inline);
    const unclosed = "<blockquote> never closed";
    expect(userBlockquotesToMarkdown(unclosed)).toBe(unclosed);
  });

  it("keeps text after a closing tag on the same line as it was", () => {
    const trailing = "<blockquote>x</blockquote> and more";
    expect(userBlockquotesToMarkdown(trailing)).toBe(trailing);
  });
});
