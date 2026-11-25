import type { AssistantCitation } from "@t3tools/contracts";
import {
  assistantCitationIdentity,
  collectAssistantCitations,
} from "@t3tools/shared/assistantCitations";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { CommentMarkButton } from "~/components/files/QuoteCommentMarks";
import { useComposerDraftStore, type ComposerThreadTarget } from "~/composerDraftStore";
import {
  resolveAssistantCitationRange,
  type AssistantCitationSourceAnchor,
} from "~/lib/assistantTextSelection";
import { observeResize } from "~/lib/observeResize";

const HIGHLIGHT_NAME = "t3-assistant-citation-draft";
const MARK_SIZE_PX = 20;

type Mark = { key: string; citation: AssistantCitation; left: number; top: number };

function findSource(viewport: HTMLElement, citation: AssistantCitation): HTMLElement | null {
  for (const element of viewport.querySelectorAll<HTMLElement>(
    "[data-assistant-citation-source]",
  )) {
    if (
      element.dataset.assistantCitationSource === citation.messageId &&
      element.dataset.assistantCitationEnvironment === citation.environmentId &&
      element.dataset.assistantCitationThread === citation.threadId
    ) {
      return element;
    }
  }
  return null;
}

function sameMarks(a: readonly Mark[], b: readonly Mark[]) {
  return (
    a.length === b.length &&
    a.every(
      (mark, index) =>
        mark.key === b[index]!.key &&
        mark.left === b[index]!.left &&
        mark.top === b[index]!.top &&
        mark.citation.comment === b[index]!.citation.comment,
    )
  );
}

/**
 * Highlights the passages the composer's draft quotes and puts a button beside each, which opens
 * that quote's comment editor.
 */
export function DraftCitationMarks({
  viewport,
  draftTarget,
  onOpen,
}: {
  viewport: HTMLElement | null;
  draftTarget: ComposerThreadTarget;
  onOpen: (citation: AssistantCitation, sourceAnchor: AssistantCitationSourceAnchor) => boolean;
}) {
  // A string selection keeps typing in the composer from re-rendering this.
  const citationSources = useComposerDraftStore((store) =>
    collectAssistantCitations(store.getComposerDraft(draftTarget)?.prompt ?? "")
      .map((entry) => entry.source)
      .join("\n"),
  );
  const [marks, setMarks] = useState<Mark[]>([]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- follows the rendered messages' DOM to place highlights and marks over the quoted text
  useEffect(() => {
    if (!viewport || !citationSources) return;
    const citations = collectAssistantCitations(citationSources).map((entry) => entry.citation);
    const registry =
      typeof CSS !== "undefined" && typeof Highlight !== "undefined" ? CSS.highlights : undefined;
    const highlight = registry ? new Highlight() : null;
    if (registry && highlight) registry.set(HIGHLIGHT_NAME, highlight);
    let resolved: { citation: AssistantCitation; source: HTMLElement; range: Range }[] = [];
    let stale = true;
    let frame = 0;

    const measure = () => {
      frame = 0;
      if (stale) {
        stale = false;
        resolved = [];
        highlight?.clear();
        for (const citation of citations) {
          const source = findSource(viewport, citation);
          const range = source ? resolveAssistantCitationRange(source, citation) : null;
          if (!source || !range) continue;
          resolved.push({ citation, source, range });
          highlight?.add(range);
        }
      }
      const bounds = viewport.getBoundingClientRect();
      const next: Mark[] = [];
      for (const { citation, source, range } of resolved) {
        const rects = range.getClientRects();
        const line = rects.item(rects.length - 1);
        if (!line) continue;
        const top = line.top + line.height / 2 - MARK_SIZE_PX / 2;
        if (top < bounds.top || top + MARK_SIZE_PX > bounds.bottom) continue;
        // The gutter beside the message keeps the mark off the text; narrow windows have none.
        const left = Math.min(
          source.getBoundingClientRect().right + 6,
          bounds.right - MARK_SIZE_PX - 6,
        );
        next.push({ key: assistantCitationIdentity(citation), citation, left, top });
      }
      setMarks((current) => (sameMarks(current, next) ? current : next));
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    const invalidate = () => {
      stale = true;
      schedule();
    };

    const mutations = new MutationObserver(invalidate);
    mutations.observe(viewport, { childList: true, subtree: true, characterData: true });
    const stopResize = observeResize(viewport, invalidate);
    viewport.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      stopResize();
      viewport.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      if (registry?.get(HIGHLIGHT_NAME) === highlight) registry?.delete(HIGHLIGHT_NAME);
    };
  }, [citationSources, viewport]);

  if (!viewport || !citationSources || marks.length === 0) return null;
  return createPortal(
    marks.map((mark) => (
      <CommentMarkButton
        key={mark.key}
        comment={mark.citation.comment}
        left={mark.left}
        top={mark.top}
        onClick={() => {
          const source = findSource(viewport, mark.citation);
          const range = source ? resolveAssistantCitationRange(source, mark.citation) : null;
          if (source && range) onOpen(mark.citation, { source, range, viewport });
        }}
      />
    )),
    document.body,
  );
}
