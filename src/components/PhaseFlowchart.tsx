import { PHASES } from "./PhaseMinimap";
import type { PhaseId } from "./PhaseMinimap";
import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";

interface PhaseFlowchartProps {
  activePhase: PhaseId;
  completedPhases: PhaseId[];
  enabledPhases: PhaseId[];
  onSelectPhase: (id: PhaseId, origin: { x: number; y: number }) => void;
}

// Top-level cinematic view: the 5 real compiler stages as boxes+edges.
// Clicking a box "zooms into" that phase's detailed automaton view
// (wired by the caller via onSelectPhase). Only phases in enabledPhases
// are clickable — the rest light up as later phases get implemented.
export function PhaseFlowchart({ activePhase, completedPhases, enabledPhases, onSelectPhase }: PhaseFlowchartProps) {
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
      <div style={{ display: "flex", alignItems: "center" }}>
        {PHASES.map((phase, i) => {
          const isDone = completedPhases.includes(phase.id);
          const isActive = phase.id === activePhase;
          const clickable = enabledPhases.includes(phase.id);
          return (
            <div key={phase.id} style={{ display: "flex", alignItems: "center" }}>
              <button
                onClick={(e: any) => {
                  if (!clickable) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  onSelectPhase(phase.id, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                }}
                disabled={!clickable}
                style={{
                  width: 190,
                  height: 110,
                  borderRadius: 14,
                  background: isActive ? colors.nodeActive : isDone ? "rgba(34,197,94,0.12)" : colors.nodeIdle,
                  border: `2px solid ${isDone ? colors.accent : isActive ? colors.nodeActive : colors.nodeIdleBorder}`,
                  color: colors.textPrimary,
                  fontFamily: fonts.mono,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: clickable ? "pointer" : "default",
                  opacity: clickable ? 1 : 0.5,
                  boxShadow: isActive ? `0 0 24px ${colors.nodeActiveGlow}` : "none",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "background 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease",
                }}
              >
                <span style={{ textAlign: "center" }}>{phase.label}</span>
                {isDone && <span style={{ fontSize: 18, color: colors.accent }}>{"✓"}</span>}
              </button>
              {i < PHASES.length - 1 && (
                <div style={{ width: 48, height: 24, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <div style={{ width: "100%", height: 2, background: isDone ? colors.accent : colors.edge, transition: "background 0.3s ease" }} />
                  <svg width="9" height="9" viewBox="0 0 10 10" style={{ position: "absolute", right: -3 }}>
                    <path d="M0 0 L10 5 L0 10 Z" fill={isDone ? colors.accent : colors.edge} style={{ transition: "fill 0.3s ease" }} />
                  </svg>
                  {isDone && (
                    <span
                      key={phase.id}
                      className="phase-travel-dot"
                      style={{ background: colors.accent, boxShadow: `0 0 8px ${colors.nodeActiveGlow}` }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
