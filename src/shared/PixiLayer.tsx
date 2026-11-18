import { lazy, Suspense, type ComponentProps } from "react";
import type PixiTerrain from "./PixiTerrain";

const LazyTerrain = lazy(() =>
  import("./PixiTerrain").catch(() => ({ default: () => <></> })),
);
export default function PixiLayer(props: ComponentProps<typeof PixiTerrain>) {
  return (
    <Suspense fallback={null}>
      <LazyTerrain {...props} />
    </Suspense>
  );
}
