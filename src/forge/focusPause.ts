export function watchFocusLoss(onPause: () => void) {
  const onVisibilityChange = () => {
    if (document.hidden) onPause();
  };
  window.addEventListener("blur", onPause);
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    window.removeEventListener("blur", onPause);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
