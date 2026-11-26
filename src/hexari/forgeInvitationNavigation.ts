/** Recognize navigation back to the analyzer without suppressing new visits. */
export function returningToAnalyzer(currentUrl: string, referrer: string) {
  const current = new URL(currentUrl);
  const source = current.searchParams.get("from");
  if (source === "tools" || source === "forge") return true;
  if (!referrer) return false;
  try {
    const previous = new URL(referrer);
    return (
      (previous.origin === current.origin &&
        (previous.pathname === "/tools" || previous.pathname === "/forge")) ||
      previous.hostname === "forge.hirusha.space"
    );
  } catch {
    return false;
  }
}
