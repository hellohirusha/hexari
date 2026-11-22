/** Send once; report failure to the composer so the player's draft is retained. */
export async function deliverChat(
  send: (text: string) => Promise<boolean>,
  text: string,
): Promise<boolean> {
  try {
    return await send(text);
  } catch {
    return false;
  }
}
