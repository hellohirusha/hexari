const pips: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
export default function Die({ face }: { face: number }) {
  return (
    <span className="die" aria-hidden="true">
      <span className="die-face">
        {face ? (
          Array.from({ length: 9 }, (_, index) => (
            <span
              key={index}
              className={pips[face]?.includes(index) ? "die-pip" : "die-empty"}
            />
          ))
        ) : (
          <span className="die-unknown">?</span>
        )}
      </span>
    </span>
  );
}
