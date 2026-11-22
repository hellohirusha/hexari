/** Only send game and account credentials over secure connections, except on loopback. */
export function validOnlineAddress(value: string): boolean {
  try {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/forge" &&
      (url.protocol === "wss:" || (url.protocol === "ws:" && loopback))
    );
  } catch {
    return false;
  }
}
