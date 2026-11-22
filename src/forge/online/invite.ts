/** Invite metadata is cosmetic; the room ID is the only information used to join. */
export function createForgeInviteUrl(
  pageUrl: string,
  room: string,
  nickname: string,
) {
  const url = new URL(pageUrl);
  // Never include account callback codes or other page query parameters.
  url.search = "";
  url.hash = new URLSearchParams({
    "forge-room": room,
    from: nickname,
  }).toString();
  return url.toString();
}
