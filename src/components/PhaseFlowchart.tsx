import { PHASES } from "./PhaseMinimap";
import type { PhaseId } from "../compiler/trace";
import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";

export { PHASES };

interface PhaseFlowchartProps {
  activePhase: PhaseId;
  completedPhases: PhaseId[];
  enabledPhases: PhaseId[];
  errorPhase?: PhaseId;   // phase that failed: red box with ✕; every later phase shows "blocked"
  errorMessage?: string;  // short error shown inside the failed box
  onSelectPhase: (id: PhaseId, origin: { x: number; y: number }) => void;
}

// Snake layout: phases 1–4 left→right on the top row, 5–7 right→left on
// the bottom row, so seven boxes fit a ~1000 px pane without shrinking text.
const BOX_W = 180;
const BOX_H = 112;
const GAP_X = 44;
const GAP_Y = 52;
const COLS = 4;
const WIDTH = COLS * BOX_W + (COLS - 1) * GAP_X;
const HEIGHT = 2 * BOX_H + GAP_Y;

function cell(i: number): { x: number; y: number } {
  const row = i < COLS ? 0 : 1;
  const col = row === 0 ? i : 2 * COLS - 1 - i;
  return { x: col * (BOX_W + GAP_X), y: row * (BOX_H + GAP_Y) };
}

// Connector from phase i to phase i+1: right on the top row, down at the
// turn, left on the bottom row.
function Connector({ i, done }: { i: number; done: boolean }) {
  const a = cell(i), b = cell(i + 1);
  const color = done ? colors.accent : colors.edge;
  const down = a.x === b.x;
  const left = b.x < a.x;
  const style = down
    ? { left: a.x + BOX_W / 2 - 12, top: a.y + BOX_H, width: 24, height: GAP_Y }
    : { left: Math.min(a.x, b.x) + BOX_W, top: a.y + BOX_H / 2 - 12, width: GAP_X, height: 24 };
  const rotate = down ? 90 : left ? 180 : 0;
  const arrowPos = down ? { bottom: -3, left: 7.5 } : left ? { left: -3, top: 7.5 } : { right: -3, top: 7.5 };
  return (
    <div style={{ position: "absolute", ...style }}>
      <div
        style={{
          position: "absolute",
          background: color,
          transition: "background 0.3s ease",
          ...(down ? { left: 11, top: 0, width: 2, height: "100%" } : { top: 11, left: 0, height: 2, width: "100%" }),
        }}
      />
      <svg width="9" height="9" viewBox="0 0 10 10" style={{ position: "absolute", ...arrowPos, transform: `rotate(${rotate}deg)` }}>
        <path d="M0 0 L10 5 L0 10 Z" fill={color} style={{ transition: "fill 0.3s ease" }} />
      </svg>
      {done && (
        <span
          className={down ? "phase-travel-dot-down" : left ? "phase-travel-dot-rev" : "phase-travel-dot"}
          style={{ background: colors.accent, boxShadow: `0 0 8px ${colors.nodeActiveGlow}` }}
        />
      )}
    </div>
  );
}

// Top-level view: the 7 compiler phases as boxes + arrows. Clicking an
// enabled box "zooms into" that phase (wired by the caller via onSelectPhase).
export function PhaseFlowchart({ activePhase, completedPhases, enabledPhases, errorPhase, errorMessage, onSelectPhase }: PhaseFlowchartProps) {
  const errorAt = errorPhase ? PHASES.findIndex((p) => p.id === errorPhase) : -1;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: colors.background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ position: "relative", width: WIDTH, height: HEIGHT, flexShrink: 0 }}>
        {PHASES.slice(0, -1).map((p, i) => (
          <Connector key={p.id} i={i} done={completedPhases.includes(p.id)} />
        ))}

        {PHASES.map((phase, i) => {
          const isDone = completedPhases.includes(phase.id);
          const isActive = phase.id === activePhase;
          const isError = i === errorAt;
          const isBlocked = errorAt >= 0 && i > errorAt;
          const clickable = enabledPhases.includes(phase.id) && !isBlocked;
          const { x, y } = cell(i);
          const border = isError ? colors.error : isDone ? colors.accent : isActive ? colors.nodeActive : colors.nodeIdleBorder;
          return (
            <button
              key={phase.id}
              onClick={(e: any) => {
                if (!clickable) return;
                const rect = e.currentTarget.getBoundingClientRect();
                onSelectPhase(phase.id, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
              }}
              disabled={!clickable}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: BOX_W,
                height: BOX_H,
                borderRadius: 14,
                background: isError ? colors.diffRemoved : isActive ? colors.nodeActive : isDone ? colors.diffAdded : colors.nodeIdle,
                border: `2px solid ${border}`,
                color: colors.textPrimary,
                fontFamily: fonts.mono,
                cursor: clickable ? "pointer" : "default",
                opacity: clickable || isError ? 1 : 0.5,
                boxShadow: isActive ? `0 0 24px ${colors.nodeActiveGlow}` : isError ? `0 0 18px ${colors.diffRemoved}` : "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "6px 10px",
                transition: "background 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease, opacity 0.25s ease",
              }}
            >
              <span style={{ fontSize: 10, color: isActive ? colors.textPrimary : colors.textSecondary }}>{i + 1}</span>
              <span style={{ fontSize: 13, fontWeight: 700, textAlign: "center", lineHeight: 1.2 }}>{phase.label}</span>
              <span style={{ fontSize: 10.5, color: isActive ? colors.textPrimary : colors.textSecondary, textAlign: "center" }}>{phase.machine}</span>
              {isDone && !isError && <span style={{ fontSize: 14, lineHeight: 1, color: colors.accent }}>{"✓"}</span>}
              {isError && (
                <span
                  title={errorMessage}
                  style={{ fontSize: 10, color: colors.error, textAlign: "center", lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                >
                  {"✕ "}{errorMessage ?? "error"}
                </span>
              )}
              {isBlocked && (
                <span style={{ fontSize: 9.5, color: colors.textSecondary, textAlign: "center" }}>
                  blocked by error in phase {errorAt + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
