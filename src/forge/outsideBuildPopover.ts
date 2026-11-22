/** Dismiss an open build menu without activating a board location underneath it. */
export function watchOutsideBuildPopover(
  documentTarget: EventTarget,
  popup: Pick<Node, "contains">,
  board: Pick<Node, "contains"> | null,
  dismiss: () => void,
) {
  const onClick = (event: Event) => {
    const target = event.target as Node | null;
    if (!target || popup.contains(target)) return;
    if (board?.contains(target)) event.stopPropagation();
    dismiss();
  };
  documentTarget.addEventListener("click", onClick, { capture: true });
  return () =>
    documentTarget.removeEventListener("click", onClick, { capture: true });
}
