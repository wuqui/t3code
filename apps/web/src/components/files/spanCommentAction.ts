// lucide's message-square-plus, matching the comment button on PDFs and rendered pages.
const MESSAGE_SQUARE_PLUS_SVG =
  '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 8v6"/><path d="M9 11h6"/></svg>';

// The editor mounts this inside its shadow root, where the app's utility classes do not apply.
export function createSpanCommentAction(label: string, onPress: () => void): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.innerHTML = MESSAGE_SQUARE_PLUS_SVG;
  button.append(label);
  Object.assign(button.style, {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    font: "500 12px/1 var(--font-sans, system-ui, sans-serif)",
    padding: "6px 10px",
    borderRadius: "999px",
    border: "1px solid color-mix(in srgb, var(--border, #888) 60%, transparent)",
    background: "var(--popover, #1f1f1f)",
    color: "var(--popover-foreground, #f5f5f5)",
    boxShadow: "0 1px 3px rgb(0 0 0 / 0.2)",
    cursor: "pointer",
  });
  // Keep the editor selection while the button takes the press.
  button.addEventListener("pointerdown", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onPress();
  });
  return button;
}
