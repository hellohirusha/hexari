type AccountSession = {
  access_token: string;
  user: { id: string };
};

/** Link only the account and socket that are still current after session lookup. */
export async function linkOnlineAccount(
  accountId: string,
  getSession: () => Promise<AccountSession | null>,
  socket: Pick<WebSocket, "send">,
  isCurrent: () => boolean,
): Promise<boolean> {
  const session = await getSession();
  if (!session?.access_token || session.user.id !== accountId || !isCurrent())
    return false;
  socket.send(
    JSON.stringify({ type: "linkAccount", accessToken: session.access_token }),
  );
  return true;
}
