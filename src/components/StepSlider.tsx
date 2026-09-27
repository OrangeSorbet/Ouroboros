import { useRef, useState } from "preact/hooks";
import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";
import type { Chapter } from "../compiler/steps";

interface StepSliderProps {
  total: number;
  current: number;
  chapters: Chapter[];
  onSeek: (index: number) => void;
}

export function StepSlider({ total, current, chapters, onSeek }: StepSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverChapter, setHoverChapter] = useState<Chapter | null>(null);

  const indexFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * (total - 1));
  };

  const chapterAt = (index: number) =>
    chapters.find((c) => index >= c.start && index <= c.end) ?? null;

  const handleMove = (e: any) => {
    const idx = indexFromClientX(e.clientX);
    setHoverX(e.clientX);
    setHoverChapter(chapterAt(idx));
  };

  const handleDown = (e: any) => {
    e.target.setPointerCapture?.(e.pointerId);
    onSeek(indexFromClientX(e.clientX));
  };

  const handleDrag = (e: any) => {
    if (e.buttons !== 1) return;
    onSeek(indexFromClientX(e.clientX));
  };

  const progress = total > 1 ? current / (total - 1) : 0;
  const trackLeft = trackRef.current?.getBoundingClientRect().left ?? 0;

  return (
    <div
      style={{ position: "relative", width: "100%", paddingTop: 28 }}
      onPointerMove={(e: any) => { handleMove(e); handleDrag(e); }}
      onPointerLeave={() => { setHoverX(null); setHoverChapter(null); }}
    >
      {hoverChapter && hoverX !== null && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: hoverX - trackLeft,
            transform: "translateX(-50%)",
            background: colors.panelBackground,
            border: `1px solid ${colors.glassBorder}`,
            borderRadius: 6,
            padding: "4px 8px",
            fontFamily: fonts.mono,
            fontSize: 11,
            color: colors.textPrimary,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {hoverChapter.label}
        </div>
      )}

      <div
        ref={trackRef}
        onPointerDown={(e: any) => handleDown(e)}
        style={{
          position: "relative",
          height: 4,
          borderRadius: 2,
          background: colors.sliderTrack,
          cursor: "pointer",
        }}
      >
        {chapters.map((c) => (
          <div
            key={c.start}
            style={{
              position: "absolute",
              left: `${(c.start / Math.max(1, total - 1)) * 100}%`,
              top: -2,
              width: 1,
              height: 8,
              background: colors.chapterTick,
            }}
          />
        ))}

        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            width: `${progress * 100}%`,
            background: colors.sliderFill,
            borderRadius: 2,
            boxShadow: `0 0 8px ${colors.sliderGlow}`,
            transition: "width 0.25s ease",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: `${progress * 100}%`,
            top: "50%",
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: colors.sliderFill,
            boxShadow: `0 0 10px ${colors.sliderGlow}`,
            transform: "translate(-50%, -50%)",
            transition: "left 0.25s ease",
          }}
        />
      </div>
    </div>
  );
}
