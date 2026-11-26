import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./ForgeStandings.css";

export type Standing = {
  rank: number | null;
  player_name: string;
  games_played: number;
  wins: number;
  is_self: boolean;
};

export function parseStandings(value: unknown): Standing[] {
  if (!Array.isArray(value)) throw new Error("Invalid standings response");
  const rows = value.map((item: unknown) => {
    if (!item || typeof item !== "object")
      throw new Error("Invalid standings response");
    const row = item as Record<string, unknown>;
    if (
      !(
        row.rank === null ||
        (Number.isSafeInteger(row.rank) && Number(row.rank) > 0)
      ) ||
      typeof row.player_name !== "string" ||
      !Number.isSafeInteger(row.games_played) ||
      Number(row.games_played) < 0 ||
      !Number.isSafeInteger(row.wins) ||
      Number(row.wins) < 0 ||
      Number(row.wins) > Number(row.games_played) ||
      typeof row.is_self !== "boolean"
    )
      throw new Error("Invalid standings response");
    return row as Standing;
  });
  if (rows.filter((row) => row.is_self).length !== 1)
    throw new Error("Invalid standings response");
  return rows;
}

export async function loadStandings(
  client: SupabaseClient,
): Promise<Standing[]> {
  const { data, error } = await client.rpc("forge_account_standings");
  if (error) throw error;
  return parseStandings(data);
}

export default function ForgeStandings({
  client,
  userId,
}: {
  client: SupabaseClient;
  userId: string;
}) {
  const [rows, setRows] = useState<Standing[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await loadStandings(client);
        if (active) setRows(result);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, userId]);

  const own = rows?.find((row) => row.is_self);
  return (
    <section
      className="forge-standings"
      aria-labelledby="forge-standings-title"
    >
      <h3 id="forge-standings-title">Online standings</h3>
      <p>Completed online games. Rankings are based on wins.</p>
      {failed ? (
        <p role="status">
          Standings are unavailable. Reopen your account to try again.
        </p>
      ) : !rows ? (
        <p role="status">Loading standings...</p>
      ) : (
        <>
          {own && (
            <p>
              Your games: <strong>{own.games_played}</strong> · Wins:{" "}
              <strong>{own.wins}</strong> · Rank:{" "}
              <strong>{own.rank ?? "-"}</strong>
            </p>
          )}
          {rows.some((row) => row.rank !== null) && (
            <table>
              <caption>Top players and your standing</caption>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Player</th>
                  <th scope="col">Games</th>
                  <th scope="col">Wins</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((row) => row.rank !== null)
                  .map((row, index) => (
                    <tr key={`${row.rank}:${row.player_name}:${index}`}>
                      <td>{row.rank}</td>
                      <td>
                        {row.player_name}
                        {row.is_self ? " (You)" : ""}
                      </td>
                      <td>{row.games_played}</td>
                      <td>{row.wins}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
