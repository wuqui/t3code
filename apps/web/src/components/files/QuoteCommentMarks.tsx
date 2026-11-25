import { COMPOSER_CONTEXT_REVIEW_TEXT_MAX_CHARS } from "@t3tools/contracts";
import {
  findQuoteInCompactText,
  QUOTE_MARKS_HIGHLIGHT,
  runQuoteMarks,
  type QuoteMarkQuote,
  type QuoteMarkRect,
} from "@t3tools/shared/quoteMarks";
import { useGT } from "gt-react";
import { MessageSquareTextIcon, Trash2Icon } from "lucide-react";
import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useComposerDraftStore, type ComposerThreadTarget } from "~/composerDraftStore";
import {
  isWebQuoteReviewComment,
  parseQuoteReviewComment,
  type ReviewCommentContext,
} from "~/reviewCommentContext";

const MARK_SIZE_PX = 20;
const EMPTY_COMMENTS: readonly ReviewCommentContext[] = [];

/** Where a file preview's comments go, so the views inside it can mark the quoted text. */
export const QuoteCommentTargetContext = createContext<{
  readonly draftTarget: ComposerThreadTarget;
  readonly filePath: string;
} | null>(null);

/** The composer draft that comments on the chat's HTML renders go to; unset where none can. */
export const HtmlRenderCommentTargetContext = createContext<ComposerThreadTarget | null>(null);

/** The composer draft's quote comments that `belongs` picks, with the quotes to find. */
export function useDraftQuoteComments(
  draftTarget: ComposerThreadTarget | null,
  belongs: (comment: ReviewCommentContext) => boolean,
) {
  const all = useComposerDraftStore((store) =>
    draftTarget
      ? (store.getComposerDraft(draftTarget)?.reviewComments ?? EMPTY_COMMENTS)
      : EMPTY_COMMENTS,
  );
  const comments: ReviewCommentContext[] = [];
  const quotes: QuoteMarkQuote[] = [];
  for (const comment of all) {
    const quote = belongs(comment) ? parseQuoteReviewComment(comment) : null;
    if (!quote) continue;
    comments.push(comment);
    quotes.push({ id: comment.id, ...quote });
  }
  // Identifies the quotes, not the comment texts, so editing a comment does not re-find them.
  const quotesKey = JSON.stringify(quotes);
  return { comments, quotes, quotesKey };
}

function CommentEditCard(props: {
  comment: ReviewCommentContext;
  anchor: { x: number; y: number };
  onSave: (text: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const gt = useGT();
  const [text, setText] = useState(props.comment.text);
  const cardRef = useRef<HTMLFormElement>(null);
  const quote = parseQuoteReviewComment(props.comment)?.text.replace(/\s+/g, " ").trim();

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clamps the floating card inside the window after it renders
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.left = `${Math.max(8, Math.min(props.anchor.x - rect.width, window.innerWidth - rect.width - 8))}px`;
    card.style.top = `${Math.max(8, Math.min(props.anchor.y, window.innerHeight - rect.height - 8))}px`;
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- closes the card on a press outside it, like a popover
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) props.onClose();
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  });

  const save = () => props.onSave(text.trim());
  return createPortal(
    <form
      ref={cardRef}
      className="fixed z-50 flex w-80 max-w-[calc(100vw-1rem)] flex-col gap-2 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg"
      style={{ left: props.anchor.x, top: props.anchor.y }}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          props.onClose();
        }
      }}
    >
      {quote ? <p className="line-clamp-2 text-xs text-muted-foreground">{`“${quote}”`}</p> : null}
      <Textarea
        size="sm"
        autoFocus
        value={text}
        maxLength={COMPOSER_CONTEXT_REVIEW_TEXT_MAX_CHARS}
        placeholder={gt("Comment for the agent (optional)")}
        aria-label={gt("Edit comment")}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            save();
          }
        }}
      />
      <div className="flex gap-1.5">
        <Button
          type="button"
          size="xs"
          variant="ghost-destructive"
          className="me-auto"
          onClick={props.onDelete}
        >
          <Trash2Icon aria-hidden="true" />
          {gt("Delete")}
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={props.onClose}>
          {gt("Cancel")}
        </Button>
        <Button type="submit" size="xs">
          {gt("Save", { $context: "verb, saves the comment" })}
        </Button>
      </div>
    </form>,
    document.body,
  );
}

/** The round button that marks a comment on quoted text; its tooltip shows the comment. */
export function CommentMarkButton(props: {
  comment: string | undefined;
  left: number;
  top: number;
  onClick: () => void;
}) {
  const gt = useGT();
  const label = props.comment
    ? gt("Edit comment: {comment}", { comment: props.comment })
    : gt("Edit comment");
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className="fixed z-10 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm outline-none hover:bg-primary/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            style={{ left: props.left, top: props.top }}
            onPointerDown={(event) => event.preventDefault()}
            onClick={props.onClick}
          />
        }
      >
        <MessageSquareTextIcon aria-hidden="true" className="size-3" />
      </TooltipTrigger>
      {props.comment ? (
        <TooltipPopup side="left" className="max-w-72 whitespace-pre-wrap">
          {props.comment}
        </TooltipPopup>
      ) : null}
    </Tooltip>
  );
}

/**
 * A button beside each commented quote, at the right edge of `clip`, that edits or deletes the
 * comment. `rects` are the quotes' last lines in window coordinates.
 */
export function QuoteCommentMarkLayer(props: {
  draftTarget: ComposerThreadTarget;
  comments: readonly ReviewCommentContext[];
  rects: readonly QuoteMarkRect[];
  clip: { left: number; top: number; right: number; bottom: number } | null;
}) {
  const addReviewComment = useComposerDraftStore((store) => store.addReviewComment);
  const removeReviewComment = useComposerDraftStore((store) => store.removeReviewComment);
  const [editing, setEditing] = useState<{ id: string; x: number; y: number } | null>(null);
  const { clip } = props;
  const byId = new Map(props.comments.map((comment) => [comment.id, comment]));
  const editingComment = editing ? byId.get(editing.id) : undefined;

  const marks = clip
    ? props.rects.flatMap((rect) => {
        const comment = byId.get(rect.id);
        const top = (rect.top + rect.bottom) / 2 - MARK_SIZE_PX / 2;
        if (!comment || top < clip.top || top + MARK_SIZE_PX > clip.bottom) return [];
        return [{ comment, top, left: clip.right - MARK_SIZE_PX - 10 }];
      })
    : [];

  return (
    <>
      {marks.length > 0
        ? createPortal(
            marks.map(({ comment, left, top }) => (
              <CommentMarkButton
                key={comment.id}
                comment={comment.text}
                left={left}
                top={top}
                onClick={() => setEditing({ id: comment.id, x: left + MARK_SIZE_PX, y: top + 24 })}
              />
            )),
            document.body,
          )
        : null}
      {editing && editingComment ? (
        <CommentEditCard
          key={editing.id}
          comment={editingComment}
          anchor={editing}
          onSave={(text) => {
            addReviewComment(props.draftTarget, { ...editingComment, text });
            setEditing(null);
          }}
          onDelete={() => {
            removeReviewComment(props.draftTarget, editingComment.id);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

/** Marks the draft's comments on text rendered in this document under `rootRef`. */
export function DomQuoteCommentMarks(props: {
  rootRef: RefObject<HTMLElement | null>;
  draftTarget: ComposerThreadTarget;
  belongs: (comment: ReviewCommentContext) => boolean;
}) {
  const { comments, quotes, quotesKey } = useDraftQuoteComments(props.draftTarget, props.belongs);
  const [placed, setPlaced] = useState<{
    rects: QuoteMarkRect[];
    clip: DOMRect | null;
  }>({ rects: [], clip: null });
  const markerRef = useRef<ReturnType<typeof runQuoteMarks> | null>(null);
  const { rootRef } = props;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- watches the rendered document's DOM to highlight quotes and place their marks
  useEffect(() => {
    const marker = runQuoteMarks({
      root: () => rootRef.current,
      highlightName: QUOTE_MARKS_HIGHLIGHT,
      find: findQuoteInCompactText,
      report: (rects) =>
        setPlaced({ rects, clip: rootRef.current?.getBoundingClientRect() ?? null }),
    });
    markerRef.current = marker;
    return () => {
      marker.dispose();
      markerRef.current = null;
    };
  }, [rootRef]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- hands the current quotes to the DOM marker
  useEffect(() => {
    markerRef.current?.set(JSON.parse(quotesKey) as QuoteMarkQuote[]);
  }, [quotesKey]);

  if (quotes.length === 0) return null;
  return (
    <QuoteCommentMarkLayer
      draftTarget={props.draftTarget}
      comments={comments}
      rects={placed.rects}
      clip={placed.clip}
    />
  );
}

/** `DomQuoteCommentMarks` for the file the surrounding preview shows. */
export function FileQuoteCommentMarks(props: { rootRef: RefObject<HTMLElement | null> }) {
  const target = use(QuoteCommentTargetContext);
  if (!target) return null;
  return (
    <DomQuoteCommentMarks
      rootRef={props.rootRef}
      draftTarget={target.draftTarget}
      belongs={(comment) =>
        comment.filePath === target.filePath && !isWebQuoteReviewComment(comment)
      }
    />
  );
}
