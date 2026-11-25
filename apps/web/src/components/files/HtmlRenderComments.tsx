import { readFilePreviewScroll, readFilePreviewSelection } from "@t3tools/shared/htmlRender";
import {
  QUOTE_MARKS_REPORT_METHOD,
  QUOTE_MARKS_SET_METHOD,
  readQuoteMarkRects,
  type QuoteMarkRect,
} from "@t3tools/shared/quoteMarks";
import { use, useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";

import { useComposerDraftStore } from "~/composerDraftStore";
import {
  buildHtmlRenderQuoteReviewComment,
  htmlRenderQuoteSectionId,
} from "~/reviewCommentContext";
import { nextFileCommentId } from "./fileCommentAnnotations";
import {
  HtmlRenderCommentTargetContext,
  QuoteCommentMarkLayer,
  useDraftQuoteComments,
} from "./QuoteCommentMarks";
import type { RenderedTextQuote } from "./renderedTextSelection";
import { SelectionCommentPopover } from "./SelectionCommentAction";

type Box = { left: number; top: number; right: number; bottom: number };

// Mark width plus the layer's inset, so a mark lands just outside the frame's right edge.
const CHAT_GUTTER_PX = 36;

/**
 * Comments on text selected in an HTML render: the page reports selections and where the
 * draft's quotes sit (the server adds the script that does), and this places the comment
 * form and the marks over the frame. Off outside a chat whose composer can take them.
 */
export function useHtmlRenderComments(
  frameRef: RefObject<HTMLIFrameElement | null>,
  source: { readonly attachmentId: string; readonly title: string } | undefined,
) {
  const contextTarget = use(HtmlRenderCommentTargetContext);
  const draftTarget = source ? contextTarget : null;
  const sectionId = source ? htmlRenderQuoteSectionId(source.attachmentId) : null;
  const { comments, quotes, quotesKey } = useDraftQuoteComments(
    draftTarget,
    (comment) => comment.sectionId === sectionId,
  );
  const addReviewComment = useComposerDraftStore((store) => store.addReviewComment);
  const [selection, setSelection] = useState<{
    quote: RenderedTextQuote;
    position: { x: number; y: number };
    key: number;
  } | null>(null);
  // The page reports quotes in its own coordinates; the frame moves as the chat scrolls.
  const reportedMarks = useRef<QuoteMarkRect[]>([]);
  const [marks, setMarks] = useState<{ rects: QuoteMarkRect[]; clip: Box } | null>(null);

  const placeMarks = useEffectEvent(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const box = frame.getBoundingClientRect();
    const viewport = frame.closest("[data-assistant-citation-viewport]")?.getBoundingClientRect();
    setMarks({
      rects: reportedMarks.current.map((rect) => ({
        id: rect.id,
        left: box.left + rect.left,
        top: box.top + rect.top,
        right: box.left + rect.right,
        bottom: box.top + rect.bottom,
      })),
      // In the chat the marks sit in the gutter right of the frame, clear of the page's text.
      clip: viewport
        ? {
            left: Math.max(box.left, viewport.left),
            top: Math.max(box.top, viewport.top),
            right: Math.min(box.right + CHAT_GUTTER_PX, viewport.right),
            bottom: Math.min(box.bottom, viewport.bottom),
          }
        : box,
    });
  });
  const sendQuotes = () => {
    if (draftTarget === null) return;
    frameRef.current?.contentWindow?.postMessage(
      { jsonrpc: "2.0", method: QUOTE_MARKS_SET_METHOD, params: { quotes: JSON.parse(quotesKey) } },
      "*",
    );
  };
  const commentable = draftTarget !== null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- hands the sandboxed page the quotes to mark
  useEffect(() => {
    if (!commentable) return;
    frameRef.current?.contentWindow?.postMessage(
      { jsonrpc: "2.0", method: QUOTE_MARKS_SET_METHOD, params: { quotes: JSON.parse(quotesKey) } },
      "*",
    );
  }, [commentable, frameRef, quotesKey]);

  const tracking = selection !== null || quotes.length > 0;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- follows the frame as the chat around it scrolls or resizes
  useEffect(() => {
    if (!tracking) return;
    let pending = 0;
    const follow = (event: Event) => {
      const frame = frameRef.current;
      if (!frame || !(event.target instanceof Node) || !event.target.contains(frame)) return;
      setSelection(null);
      if (pending === 0) {
        pending = requestAnimationFrame(() => {
          pending = 0;
          placeMarks();
        });
      }
    };
    const resize = () => placeMarks();
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("scroll", follow, { capture: true });
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(pending);
    };
  }, [frameRef, tracking]);

  /** True when the message was the page reporting a selection or its marks. */
  const handleMessage = (data: unknown): boolean => {
    if (draftTarget === null) return false;
    const message = data as { method?: unknown; params?: unknown } | null;
    if (message?.method === QUOTE_MARKS_REPORT_METHOD) {
      const rects = readQuoteMarkRects(message.params);
      if (rects) {
        reportedMarks.current = rects;
        placeMarks();
      }
      return true;
    }
    const reported = readFilePreviewSelection(data);
    if (reported !== undefined) {
      const frame = frameRef.current;
      if (reported === null || !frame) {
        setSelection(null);
        return true;
      }
      const box = frame.getBoundingClientRect();
      const { text, prefix, suffix, rect } = reported;
      setSelection((current) => ({
        quote: { text, prefix, suffix },
        position: { x: box.left + rect.right, y: box.top + rect.bottom + 4 },
        key: (current?.key ?? 0) + 1,
      }));
      return true;
    }
    if (readFilePreviewScroll(data) !== undefined) {
      setSelection(null);
      return true;
    }
    return false;
  };

  const overlay =
    draftTarget === null || !source ? null : (
      <>
        {quotes.length > 0 && marks ? (
          <QuoteCommentMarkLayer
            draftTarget={draftTarget}
            comments={comments}
            rects={marks.rects}
            clip={marks.clip}
          />
        ) : null}
        {selection ? (
          <SelectionCommentPopover
            key={selection.key}
            quote={selection.quote}
            position={selection.position}
            onComment={(quote, comment) => {
              addReviewComment(
                draftTarget,
                buildHtmlRenderQuoteReviewComment({
                  id: nextFileCommentId(),
                  attachmentId: source.attachmentId,
                  title: source.title,
                  text: comment,
                  quote,
                }),
              );
              return true;
            }}
            onDismiss={() => setSelection(null)}
          />
        ) : null}
      </>
    );

  return { handleMessage, sendQuotes, overlay };
}
