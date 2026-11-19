export default function CoachAdvice({ advice }: { advice: string }) {
  return (
    <ol className="coach-advice">
      {advice
        .split("\n")
        .filter(Boolean)
        .map((point, index) => (
          <li key={`${index}-${point}`}>{point}</li>
        ))}
    </ol>
  );
}
