import { useLayoutEffect, useRef, useState } from "react";

/** Fit the complete name within its score card without clipping or wrapping. */
export default function ForgeScoreName({ name }: { name: string }) {
  const container = useRef<HTMLElement>(null);
  const measurement = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const card = container.current;
    const text = measurement.current;
    if (!card || !text) return;

    const update = () => {
      const width = text.getBoundingClientRect().width;
      if (width > 0 && card.clientWidth > 0) {
        setScale(Math.min(1, card.clientWidth / width));
      }
    };

    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(card);
    observer.observe(text);
    return () => observer.disconnect();
  }, [name]);

  return (
    <small className="forge-score-name" ref={container}>
      <span
        aria-hidden="true"
        className="forge-score-name-measure"
        ref={measurement}
      >
        {name}
      </span>
      <span style={{ fontSize: `${scale * 100}%` }}>{name}</span>
    </small>
  );
}
