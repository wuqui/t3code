import {
  ASSISTANT_CITATION_MAX_TEXT_LENGTH,
  COMPOSER_CONTEXT_REVIEW_TEXT_MAX_CHARS,
} from "@t3tools/contracts";
import { useGT } from "gt-react";
import { MessageSquarePlusIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import {
  isSelectionRectVisible,
  observeSelectionActions,
  resolveSelectionActionPosition,
  type SelectionActionPoint,
} from "~/lib/selectionActions";

export type SelectionCapture<Q> = (
  viewport: HTMLElement,
  selection: Selection | null,
) => { quote: Q; range: Range } | null;

/**
 * A "Comment" button at `position` that opens a comment form for `quote`. `onComment` returns
 * false when the comment was not added; `onDismiss` hides it.
 */
export function SelectionCommentPopover<Q extends { readonly text: string }>(props: {
  quote: Q;
  position: SelectionActionPoint;
  heading?: string | undefined;
  onComment: (quote: Q, comment: string) => boolean;
  onDismiss: () => void;
  cardRef?: RefObject<HTMLDivElement | null> | undefined;
}) {
  const gt = useGT();
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState("");
  const ownRef = useRef<HTMLDivElement>(null);
  const cardRef = props.cardRef ?? ownRef;
  const { position } = props;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clamps the floating card inside the window after each render resizes it
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.left = `${Math.max(8, Math.min(position.x, window.innerWidth - rect.width - 8))}px`;
    card.style.top = `${Math.max(8, Math.min(position.y, window.innerHeight - rect.height - 8))}px`;
  });

  const tooLong = props.quote.text.length > ASSISTANT_CITATION_MAX_TEXT_LENGTH;
  const save = () => {
    if (props.onComment(props.quote, comment)) props.onDismiss();
  };

  return createPortal(
    <div
      ref={cardRef}
      className="fixed z-50 max-w-[calc(100vw-1rem)]"
      style={{ left: position.x, top: position.y }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" && !event.nativeEvent.isComposing) {
          event.preventDefault();
          props.onDismiss();
        }
      }}
    >
      {editing ? (
        <form
          className="flex w-80 flex-col gap-2 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {props.heading ? `${props.heading} · ` : ""}
            {`“${props.quote.text.replace(/\s+/g, " ").trim()}”`}
          </p>
          <Textarea
            size="sm"
            autoFocus
            value={comment}
            maxLength={COMPOSER_CONTEXT_REVIEW_TEXT_MAX_CHARS}
            placeholder={gt("Comment for the agent (optional)")}
            aria-label={gt("Comment on the selected text")}
            onChange={(event) => setComment(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                save();
              }
            }}
          />
          <div className="flex justify-end gap-1.5">
            <Button type="button" size="xs" variant="ghost" onClick={props.onDismiss}>
              {gt("Cancel")}
            </Button>
            <Button type="submit" size="xs">
              {gt("Add to composer")}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          size="xs"
          variant="glass"
          disabled={tooLong}
          aria-label={
            tooLong ? gt("Selection is too long to cite") : gt("Comment on the selected text")
          }
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => setEditing(true)}
        >
          <MessageSquarePlusIcon aria-hidden="true" className="size-3.5" />
          {tooLong
            ? gt("Shorten selection")
            : gt("Comment", { $context: "verb, button that comments on the selected text" })}
        </Button>
      )}
    </div>,
    document.body,
  );
}

/** Offers a comment on text selected in `viewportRef`. */
export function SelectionCommentAction<Q extends { readonly text: string }>(props: {
  viewportRef: RefObject<HTMLElement | null>;
  capture: SelectionCapture<Q>;
  heading?: ((quote: Q) => string) | undefined;
  onComment: (quote: Q, comment: string) => boolean;
}) {
  const [selection, setSelection] = useState<{
    quote: Q;
    position: SelectionActionPoint;
    key: number;
  } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<ReturnType<typeof observeSelectionActions> | null>(null);
  const { capture } = props;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- follows document selection changes inside the viewport
  useEffect(() => {
    const viewport = props.viewportRef.current;
    if (!viewport) return;
    const clear = () => setSelection(null);
    const update = (pointer: SelectionActionPoint | null) => {
      const captured = capture(viewport, window.getSelection());
      const bounds = viewport.getBoundingClientRect();
      const rects = captured ? Array.from(captured.range.getClientRects()) : [];
      if (!captured || !rects.some((rect) => isSelectionRectVisible(rect, [bounds]))) {
        clear();
        return;
      }
      setSelection((current) => ({
        quote: captured.quote,
        position: resolveSelectionActionPosition({
          bounds,
          selectionRect: rects.at(-1) ?? null,
          pointer,
          viewport: { width: window.innerWidth, height: window.innerHeight },
        }),
        key: (current?.key ?? 0) + 1,
      }));
    };
    const actions = observeSelectionActions({
      element: viewport,
      getActionElement: () => cardRef.current,
      onSelection: update,
      onDismiss: clear,
    });
    actionsRef.current = actions;
    document.addEventListener("selectionchange", actions.selectionChanged);
    return () => {
      document.removeEventListener("selectionchange", actions.selectionChanged);
      actions.dispose();
      actionsRef.current = null;
    };
  }, [capture, props.viewportRef]);

  if (!selection) return null;
  return (
    <SelectionCommentPopover
      key={selection.key}
      quote={selection.quote}
      position={selection.position}
      heading={props.heading?.(selection.quote)}
      cardRef={cardRef}
      onComment={(quote, comment) => {
        if (!props.onComment(quote, comment)) return false;
        window.getSelection()?.removeAllRanges();
        return true;
      }}
      onDismiss={() => {
        actionsRef.current?.cancel();
        setSelection(null);
      }}
    />
  );
}
