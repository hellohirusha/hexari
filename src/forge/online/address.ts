/** Only allow loopback servers when the app itself is running on loopback. */
export function validOnlineAddress(
  value: string,
  appOrigin = typeof window === "undefined" ? "" : window.location.origin,
): boolean {
  try {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const localApp = appOrigin
      ? ["localhost", "127.0.0.1", "[::1]"].includes(
          new URL(appOrigin).hostname,
        )
      : false;
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/forge" &&
      (loopback ? localApp : url.protocol === "wss:") &&
      (url.protocol === "wss:" || (url.protocol === "ws:" && loopback))
    );
  } catch {
    return false;
  }
}
