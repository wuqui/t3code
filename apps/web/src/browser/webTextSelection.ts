export type WebTextSelection = {
  readonly text: string;
  readonly prefix: string;
  readonly suffix: string;
  /** Viewport rectangle in the page's CSS pixels. */
  readonly rect: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  };
  readonly pageUrl: string;
  readonly pageTitle: string | null;
};

const CONTEXT = 32;

/**
 * A browser page's selection report (see TextSelectionReport in the desktop preload): a selection,
 * `null` when it cleared, `undefined` for anything malformed.
 */
export function readWebTextSelection(data: unknown): WebTextSelection | null | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const { text, prefix, suffix, rect, pageUrl, pageTitle } = data as Record<string, unknown>;
  if (typeof text !== "string") return undefined;
  if (!text.trim()) return null;
  if (typeof rect !== "object" || rect === null || typeof pageUrl !== "string") return undefined;
  const { left, top, right, bottom } = rect as Record<string, unknown>;
  if (
    ![left, top, right, bottom].every((edge) => typeof edge === "number" && Number.isFinite(edge))
  ) {
    return undefined;
  }
  return {
    text,
    prefix: typeof prefix === "string" ? prefix.slice(-CONTEXT) : "",
    suffix: typeof suffix === "string" ? suffix.slice(0, CONTEXT) : "",
    rect: {
      left: left as number,
      top: top as number,
      right: right as number,
      bottom: bottom as number,
    },
    pageUrl,
    pageTitle: typeof pageTitle === "string" && pageTitle.trim() ? pageTitle : null,
  };
}
