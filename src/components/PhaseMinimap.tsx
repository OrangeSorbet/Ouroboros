import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";

// The 5 real compiler stages (docs/compiler-phases.md) — Snek currently
// implements Lexical Analysis fully in the UI; the rest render as
// upcoming/dimmed until Phase 6 (PhaseFlowchart) wires them up.
export type PhaseId = "lex" | "parse" | "ast-instr" | "cfg-opt" | "bytecode";

export interface Phase {
  id: PhaseId;
  label: string;
}

export const PHASES: Phase[] = [
  { id: "lex", label: "Lexical Analysis" },
  { id: "parse", label: "Syntax Analysis" },
  { id: "ast-instr", label: "AST → Instructions" },
  { id: "cfg-opt", label: "CFG + Optimize" },
  { id: "bytecode", label: "Bytecode Emission" },
];

interface PhaseMinimapProps {
  activePhase: PhaseId;
  completedPhases: PhaseId[];
  dim?: boolean;
}

export function PhaseMinimap({ activePhase, completedPhases, dim }: PhaseMinimapProps) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 108,
        right: 16,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: colors.glass,
        border: `1px solid ${colors.glassBorder}`,
        borderRadius: 10,
        padding: "8px 12px",
        backdropFilter: "blur(14px)",
        fontFamily: fonts.mono,
        fontSize: 10,
        opacity: dim ? 0.45 : 1,
        transition: "opacity 0.2s ease",
      }}
    >
      {PHASES.map((phase, i) => {
        const isDone = completedPhases.includes(phase.id);
        const isActive = phase.id === activePhase;
        return (
          <div key={phase.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: isDone ? colors.accent : isActive ? colors.nodeActive : colors.nodeIdleBorder,
                boxShadow: isActive ? `0 0 8px ${colors.nodeActiveGlow}` : "none",
                transition: "background 0.25s ease, box-shadow 0.25s ease",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                color: isActive ? colors.textPrimary : isDone ? colors.accent : colors.textSecondary,
                whiteSpace: "nowrap",
              }}
            >
              {phase.label}
            </span>
            {i < PHASES.length - 1 && (
              <span style={{ color: colors.textSecondary, margin: "0 4px", opacity: 0.6 }}>{"→"}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
