export function positionBuildPopover(
  board: { width: number; height: number },
  popup: { width: number; height: number },
  anchor: { x: number; y: number },
) {
  const margin = 4;
  const gap = 8;
  const maxLeft = Math.max(margin, board.width - popup.width - margin);
  const maxTop = Math.max(margin, board.height - popup.height - margin);
  const left = Math.max(margin, Math.min(maxLeft, anchor.x - popup.width / 2));
  const above = anchor.y - popup.height - gap;
  const preferredTop = above >= margin ? above : anchor.y + gap;
  const top = Math.max(margin, Math.min(maxTop, preferredTop));
  return { left, top };
}
