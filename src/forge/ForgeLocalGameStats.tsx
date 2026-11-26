import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type LocalGameCounts = { bot_games: number; hotseat_games: number };

export async function loadLocalGameCounts(
  client: SupabaseClient,
): Promise<LocalGameCounts> {
  const { data, error } = await client.rpc("forge_local_game_counts");
  if (
    error ||
    !Array.isArray(data) ||
    data.length !== 1 ||
    !data[0] ||
    !Number.isSafeInteger(data[0].bot_games) ||
    data[0].bot_games < 0 ||
    !Number.isSafeInteger(data[0].hotseat_games) ||
    data[0].hotseat_games < 0
  )
    throw new Error("Invalid local game count response");
  return data[0] as LocalGameCounts;
}

export default function ForgeLocalGameStats({
  client,
  userId,
}: {
  client: SupabaseClient;
  userId: string;
}) {
  const [counts, setCounts] = useState<LocalGameCounts | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void loadLocalGameCounts(client)
        .then((result) => {
          if (active) {
            setCounts(result);
            setFailed(false);
          }
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    };
    refresh();
    window.addEventListener("forge:local-game-recorded", refresh);
    return () => {
      active = false;
      window.removeEventListener("forge:local-game-recorded", refresh);
    };
  }, [client, userId]);
  return (
    <section
      className="forge-standings"
      aria-labelledby="forge-personal-games-title"
    >
      <h3 id="forge-personal-games-title">Personal games</h3>
      <p>
        Completed bot and local games are self-reported and do not affect online
        rankings.
      </p>
      {failed ? (
        <p role="status">Personal game counts are unavailable.</p>
      ) : !counts ? (
        <p role="status">Loading personal games...</p>
      ) : (
        <p>
          Bot: <strong>{counts.bot_games}</strong> · Local:{" "}
          <strong>{counts.hotseat_games}</strong>
        </p>
      )}
    </section>
  );
}
