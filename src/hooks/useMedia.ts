import { useEffect, useState } from "preact/hooks";

// Phone breakpoint (docs/roadmap.md M5). Keep in sync with the @media rules
// in styles/layout.css — CSS handles layout (incl. the stacked tablet
// layout); this drives the few components that change structure on phones
// (flowchart, scrubber tabs, navbar) rather than size.
export const PHONE = "(max-width: 640px)";

export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const update = () => setOn(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, [query]);
  return on;
}
