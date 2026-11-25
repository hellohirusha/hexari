import { useEffect, useRef } from "react";
import { resultSound, startResultAudio, startResultMusic } from "./sound";

type ResultAudioState = {
  started: boolean;
  sound: boolean;
  phase: string;
  winner: number | null;
  opponent: "bot" | "hotseat" | "online";
  seat?: number;
};

/** Keep result audio alive for the finished game, independent of the dialog. */
export function useResultAudio({
  started,
  sound,
  phase,
  winner,
  opponent,
  seat,
}: ResultAudioState) {
  const cuePlayed = useRef(false);

  useEffect(() => {
    if (!started || phase !== "end") {
      cuePlayed.current = false;
      return;
    }
    if (!sound || winner === null) return;
    const outcome = resultSound(winner, opponent, seat);
    if (!outcome) return;
    const player = cuePlayed.current
      ? startResultMusic()
      : startResultAudio(outcome);
    cuePlayed.current = true;
    return () => player.stop();
  }, [started, sound, phase, winner, opponent, seat]);
}
