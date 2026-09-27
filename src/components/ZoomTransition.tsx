import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";

interface ZoomTransitionProps {
  origin: { x: number; y: number };
  direction: "in" | "out";
  renderFrom: () => ComponentChildren;
  renderTo: () => ComponentChildren;
  onDone: () => void;
}

const DURATION_MS = 650;

// Dolly-zoom, not a wipe.
// direction "in" (entering a phase): the box we clicked recedes — scales
// up and fades out past the camera — while what's inside it (the phase
// view) rushes toward the camera from near-zero until it fills the
// screen.
// direction "out" (leaving a phase): reverse of the above — the phase
// view (the thing that filled the screen) shrinks back down and fades,
// while the flowchart (the box we were "inside", oversized while we were
// zoomed in) shrinks back down to its normal, fits-the-page size.
export function ZoomTransition({ origin, direction, renderFrom, renderTo, onDone }: ZoomTransitionProps) {
  // The "to" view is mounted invisibly first so heavy children (React
  // Flow's fitView layout pass, etc.) settle *before* the visible
  // animation starts — otherwise the destination visibly snaps into
  // place partway through the zoom instead of already being correct.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => setReady(true));
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(onDone, DURATION_MS);
    return () => clearTimeout(id);
  }, [ready]);

  const transformOrigin = `${origin.x}px ${origin.y}px`;
  const fromClass = ready ? (direction === "in" ? "zoom-recede" : "zoom-shrink-out") : "";
  const toClass = ready ? (direction === "in" ? "zoom-emerge" : "zoom-settle-in") : "";

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 200, pointerEvents: "none", overflow: "hidden" }}>
      <div className={fromClass} style={{ position: "absolute", inset: 0, transformOrigin, opacity: ready ? undefined : 1 }}>
        {renderFrom()}
      </div>
      <div className={toClass} style={{ position: "absolute", inset: 0, transformOrigin, opacity: ready ? undefined : 0 }}>
        {renderTo()}
      </div>
    </div>
  );
}
