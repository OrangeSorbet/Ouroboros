import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";
import type { PhaseId } from "../compiler/trace";
import { SCRUBBER_HEIGHT } from "./Scrubber";

export type { PhaseId };

export interface Phase {
  id: PhaseId;
  label: string;   // flowchart box title
  short: string;   // minimap label
  machine: string; // one-line subtitle: the model of computation behind the phase
}

// The 7 compiler phases, in pipeline order (docs/phase34plan.md §1).
export const PHASES: Phase[] = [
  { id: "lex", label: "Lexical Analysis", short: "Lex", machine: "DFA" },
  { id: "parse", label: "Syntax Analysis", short: "Parse", machine: "PDA · LL(1)" },
  { id: "semantic", label: "Semantic Analysis", short: "Semantic", machine: "symbol table" },
  { id: "ir", label: "AST → Instructions", short: "IR", machine: "syntax-directed translation" },
  { id: "opt", label: "Control-Flow Graph + Optimize", short: "Optimize", machine: "graph + fixpoint" },
  { id: "bytecode", label: "Bytecode Emission", short: "Bytecode", machine: "assembler" },
  { id: "vm", label: "Execution (VM)", short: "VM", machine: "stack VM" },
];

interface PhaseMinimapProps {
  activePhase: PhaseId;
  completedPhases: PhaseId[];
  errorPhase?: PhaseId;
  dim?: boolean;
}

export function PhaseMinimap({ activePhase, completedPhases, errorPhase, dim }: PhaseMinimapProps) {
  const errorAt = errorPhase ? PHASES.findIndex((p) => p.id === errorPhase) : -1;
  return (
    <div
      style={{
        position: "absolute",
        // sits just above the scrubber bar (its content + the caller's ~24px padding)
        bottom: SCRUBBER_HEIGHT + 36,
        right: 16,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: colors.glass,
        border: `1px solid ${colors.glassBorder}`,
        borderRadius: 10,
        padding: "6px 10px",
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
        const isError = i === errorAt;
        const isBlocked = errorAt >= 0 && i > errorAt;
        const dot = isError ? colors.error : isActive ? colors.nodeActive : isDone ? colors.accent : colors.nodeIdleBorder;
        return (
          <div key={phase.id} title={phase.label} style={{ display: "flex", alignItems: "center", gap: 4, opacity: isBlocked ? 0.4 : 1 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: dot,
                boxShadow: isActive ? `0 0 8px ${colors.nodeActiveGlow}` : "none",
                transition: "background 0.25s ease, box-shadow 0.25s ease",
                flexShrink: 0,
              }}
            />
            <span style={{ color: isError ? colors.error : isActive ? colors.textPrimary : isDone ? colors.accent : colors.textSecondary, whiteSpace: "nowrap" }}>
              {phase.short}
            </span>
            {i < PHASES.length - 1 && (
              <span style={{ color: colors.textSecondary, margin: "0 2px", opacity: 0.6 }}>{"→"}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
