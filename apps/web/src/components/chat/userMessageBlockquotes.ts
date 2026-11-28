const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const BLOCKQUOTE = /^([ \t]*)<blockquote(?:\s[^>]*)?>([\s\S]*?)<\/blockquote>[ \t]*$/i;
const OPEN = /^[ \t]*<blockquote(?:\s[^>]*)?>/i;
const CLOSE = /<\/blockquote>[ \t]*$/i;

/**
 * User messages show raw HTML as text, so a pasted `<blockquote>…</blockquote>` reads as tags.
 * Rewrites each one that starts and ends a line, outside fenced code, as a Markdown quote.
 */
export function userBlockquotesToMarkdown(text: string): string {
  if (!/<blockquote/i.test(text)) return text;
  const lines = text.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const fenceMatch = FENCE.exec(line);
    if (fence !== null) {
      if (fenceMatch && fenceMatch[1]![0] === fence[0] && fenceMatch[1]!.length >= fence.length) {
        fence = null;
      }
      out.push(line);
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1]!;
      out.push(line);
      continue;
    }
    if (!OPEN.test(line)) {
      out.push(line);
      continue;
    }
    const end = lines.findIndex((candidate, at) => at >= index && CLOSE.test(candidate));
    if (end === -1) {
      out.push(line);
      continue;
    }
    const match = BLOCKQUOTE.exec(lines.slice(index, end + 1).join("\n"));
    if (!match) {
      out.push(line);
      continue;
    }
    const body = match[2]!.trim();
    if (out.length > 0 && out.at(-1)!.trim() !== "") out.push("");
    out.push(
      ...body.split("\n").map((bodyLine) => `${match[1]}> ${bodyLine.trimStart()}`.trimEnd()),
    );
    if (end + 1 < lines.length && lines[end + 1]!.trim() !== "") out.push("");
    index = end;
  }
  return out.join("\n");
}
