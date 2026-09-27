import { useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";
import { StepSlider } from "./StepSlider";
import type { Chapter } from "../compiler/steps";

interface ScrubberProps {
  index: number;
  total: number;
  chapters?: Chapter[];
  onSeek: (index: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  speed: number; // 0 = manual, 1 = fastest (~3 steps/sec)
  onSpeedChange: (speed: number) => void;
  description: ComponentChildren;
  meta?: ComponentChildren;
}

const iconButtonStyle = {
  background: "transparent",
  border: `1px solid ${colors.glassBorder}`,
  borderRadius: 8,
  color: colors.textPrimary,
  width: 26,
  height: 26,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
} as const;

// Converts the 0..1 speed dial into an autoplay interval. 0 is "manual"
// (no autoplay tick at all); the rest ranges from 1 step/5s up to ~3/sec.
export function speedToIntervalMs(speed: number): number | null {
  if (speed <= 0) return null;
  const SLOWEST = 5000;
  const FASTEST = 1000 / 3;
  return SLOWEST - speed * (SLOWEST - FASTEST);
}

type IconName = "play" | "pause" | "prev" | "next" | "bolt";

function Icon({ name, size = 12 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ComponentChildren> = {
    play: <path d="M8 5v14l11-7z" />,
    pause: <path d="M6 5h4v14H6zM14 5h4v14h-4z" />,
    prev: <path d="M18 6v12l-8.5-6zM6 6h2v12H6z" />,
    next: <path d="M6 6v12l8.5-6zM16 6h2v12h-2z" />,
    bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      {paths[name]}
    </svg>
  );
}

// A small draggable 0..1 slider matching StepSlider's visual language —
// used for the speed dial instead of a raw <input type="range">.
function MiniSlider({ value, onChange, width = 90 }: { value: number; onChange: (v: number) => void; width?: number }) {
  const trackRef = useRef<HTMLDivElement>(null);

  const setFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onChange(ratio);
  };

  return (
    <div
      ref={trackRef}
      onPointerDown={(e: any) => { e.currentTarget.setPointerCapture?.(e.pointerId); setFromClientX(e.clientX); }}
      onPointerMove={(e: any) => { if (e.buttons === 1) setFromClientX(e.clientX); }}
      style={{ position: "relative", width, height: 16, display: "flex", alignItems: "center", cursor: "pointer", flexShrink: 0 }}
    >
      <div style={{ position: "absolute", left: 0, right: 0, height: 4, borderRadius: 2, background: colors.sliderTrack }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          width: `${value * 100}%`,
          height: 4,
          borderRadius: 2,
          background: colors.sliderFill,
          boxShadow: `0 0 6px ${colors.sliderGlow}`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: `${value * 100}%`,
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: colors.sliderFill,
          boxShadow: `0 0 8px ${colors.sliderGlow}`,
          transform: "translateX(-50%)",
        }}
      />
    </div>
  );
}

function SpeedControl({ speed, onChange }: { speed: number; onChange: (v: number) => void }) {
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const expanded = hovering || pinned;

  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8 }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <button
        onClick={() => setPinned((p) => !p)}
        title="Playback speed"
        style={{
          ...iconButtonStyle,
          background: pinned ? colors.nodeActive : "transparent",
          borderColor: pinned ? colors.nodeActive : colors.glassBorder,
          color: colors.textPrimary,
        }}
      >
        <Icon name="bolt" />
      </button>
      <div
        style={{
          width: expanded ? 90 : 0,
          opacity: expanded ? 1 : 0,
          overflow: "hidden",
          transition: "width 0.25s ease, opacity 0.2s ease",
        }}
      >
        <MiniSlider value={speed} onChange={onChange} />
      </div>
    </div>
  );
}

// Reusable playback control shared by every phase's detail view (lex,
// parse, and whatever comes later): play/pause, step back/forward, a
// step counter, a collapsible speed dial, and the scrub track itself.
export function Scrubber({
  index,
  total,
  chapters = [],
  onSeek,
  playing,
  onTogglePlay,
  speed,
  onSpeedChange,
  description,
  meta,
}: ScrubberProps) {
  const hasSteps = total > 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <button onClick={() => hasSteps && onTogglePlay()} disabled={!hasSteps} style={iconButtonStyle}>
          <Icon name={playing ? "pause" : "play"} />
        </button>
        <button
          onClick={() => hasSteps && onSeek(Math.max(0, index - 1))}
          disabled={!hasSteps || index <= 0}
          style={{ ...iconButtonStyle, opacity: !hasSteps || index <= 0 ? 0.4 : 1 }}
        >
          <Icon name="prev" />
        </button>
        <span style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.textSecondary, minWidth: 90, textAlign: "center" }}>
          Step {hasSteps ? index + 1 : 0} / {total}
        </span>
        <button
          onClick={() => hasSteps && onSeek(Math.min(total - 1, index + 1))}
          disabled={!hasSteps || index >= total - 1}
          style={{ ...iconButtonStyle, opacity: !hasSteps || index >= total - 1 ? 0.4 : 1 }}
        >
          <Icon name="next" />
        </button>
        <SpeedControl speed={speed} onChange={onSpeedChange} />
        {meta && (
          <span style={{ marginLeft: "auto", fontFamily: fonts.mono, fontSize: 12, color: colors.accent }}>
            {meta}
          </span>
        )}
      </div>

      <div key={index} className="step-fade-in" style={{ color: colors.textPrimary, fontSize: 14, marginBottom: 6, minHeight: 20 }}>
        {description}
      </div>

      <StepSlider
        total={Math.max(total, 1)}
        current={index}
        chapters={chapters}
        onSeek={onSeek}
      />
    </div>
  );
}
