import { useEffect, useRef, useState } from "react";
import { Application, Graphics } from "pixi.js";
import { centers, type Resource, type Tile } from "./board";

const colors: Record<Resource, number> = {
  wood: 0x456e54,
  brick: 0xb56e4f,
  wheat: 0xd6ad5b,
  ore: 0x788792,
  sheep: 0x88a56d,
  desert: 0xd2bd8b,
};
type Props = {
  board: Tile[];
  selected: number | null;
  onReady: (ready: boolean) => void;
  geometry?: {
    centers: typeof centers;
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export default function PixiTerrain({
  board,
  selected,
  onReady,
  geometry,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [app, setApp] = useState<Application | null>(null);
  const readyRef = useRef(onReady);
  useEffect(() => {
    readyRef.current = onReady;
  }, [onReady]);
  useEffect(() => {
    let cancelled = false;
    let initialized = false;
    let instance: Application | undefined;
    async function init() {
      try {
        instance = new Application();
        await instance.init({
          width: geometry?.width ?? 480,
          height: geometry?.height ?? 370,
          backgroundAlpha: 0,
          antialias: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
        });
        initialized = true;
        if (cancelled) {
          instance.destroy(true);
          return;
        }
        host.current?.appendChild(instance.canvas);
        setApp(instance);
      } catch {
        if (!cancelled) readyRef.current(false);
      }
    }
    void init();
    return () => {
      cancelled = true;
      if (initialized) instance?.destroy(true, { children: true });
    };
  }, [geometry]);
  useEffect(() => {
    if (!app) return;
    let cancelled = false;
    async function draw() {
      if (cancelled || !app) return;
      app.stage.removeChildren().forEach((child) => child.destroy());
      const graphics = new Graphics();
      (geometry?.centers ?? centers).forEach((center, i) => {
        const coords = Array.from({ length: 6 }, (_, j) => {
          const angle = ((60 * j - 30) * Math.PI) / 180;
          return [
            240 - (geometry?.x ?? 0) + (center.x + Math.cos(angle) * 0.96) * 45,
            185 - (geometry?.y ?? 0) + (center.y + Math.sin(angle) * 0.96) * 45,
          ];
        }).flat();
        graphics
          .poly(coords)
          .fill(colors[board[i].resource])
          .stroke({
            color: selected === i ? 0xffe8aa : 0x18262a,
            width: selected === i ? 3 : 2,
          });
      });
      app.stage.addChild(graphics);
      app.render();
      readyRef.current(true);
    }
    void draw().catch(() => readyRef.current(false));
    return () => {
      cancelled = true;
    };
  }, [app, board, selected, geometry]);
  return <div ref={host} className="pixi-terrain" aria-hidden="true" />;
}
