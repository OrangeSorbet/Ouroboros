import { CLASSES, CLASS_LABELS, STATES, State, delta } from "../../compiler/dfa";
import type { DfaStep } from "../../compiler/lexer";
import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";

// Short cell names so all 18 classes fit across; full name on hover.
const SHORT: Record<State, string> = {
  START: "S", IN_WHITESPACE: "WS", IN_LINE_COMMENT: "LCOM", IN_IDENT: "ID", IN_NUMBER: "NUM",
  NUM_DOT: "N.", IN_FLOAT: "FLT",
  BAD_NUMBER: "BAD", SINGLE: "SGL", SAW_EQ: "=", SAW_EQ_EQ: "==", SAW_LT: "<", SAW_LT_EQ: "<=",
  SAW_GT: ">", SAW_GT_EQ: ">=", SAW_BANG: "!", SAW_BANG_EQ: "!=", SAW_AMP: "&", SAW_AMP_AMP: "&&",
  SAW_PIPE: "|", SAW_PIPE_PIPE: "||", SAW_SLASH: "/", IN_BLOCK_COMMENT: "BCOM", BLOCK_STAR: "B*",
  BLOCK_END: "B*/", IN_STRING: "STR", STRING_ESC: "ESC", STRING_END: "STR\"", DEAD: "·",
};

interface DeltaTableProps {
  step: DfaStep;
}

// The full, total δ: one cell per (state, class). The highlight is keyed on
// the exact (state, class) pair the step consulted — keying on (from, to)
// would light up every class that happens to share a target.
export function DeltaTable({ step }: DeltaTableProps) {
  const consulted = step.kind === "move" || step.kind === "no-move" || (step.kind === "error" && step.cls);
  const th = { position: "sticky" as const, top: 0, background: colors.panelBackground, padding: "3px 4px", color: colors.textSecondary, fontWeight: 400, zIndex: 1 };
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "auto", padding: "40px 8px 8px" }}>
      <table style={{ borderCollapse: "collapse", fontFamily: fonts.mono, fontSize: 10, margin: "0 auto" }}>
        <thead>
          <tr>
            <th style={{ ...th, left: 0, zIndex: 2, textAlign: "left" }}>δ</th>
            {CLASSES.map((c) => (
              <th key={c} title={CLASS_LABELS[c]} style={{ ...th, color: consulted && c === step.cls ? colors.nodeActive : colors.textSecondary }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STATES.map((s) => {
            const rowActive = consulted && s === step.from;
            return (
              <tr key={s} style={{ background: rowActive ? colors.codeLineHighlight : "transparent" }}>
                <td style={{ position: "sticky", left: 0, background: rowActive ? colors.codeLineHighlight : colors.panelBackground, padding: "2px 6px", color: rowActive ? colors.textPrimary : colors.textSecondary, whiteSpace: "nowrap" }}>
                  {s}
                </td>
                {CLASSES.map((c) => {
                  const to = delta(s, c);
                  const active = rowActive && c === step.cls;
                  return (
                    <td
                      key={c}
                      title={`δ(${s}, ${c}) = ${to}`}
                      style={{
                        textAlign: "center",
                        padding: "2px 4px",
                        border: `1px solid ${active ? (to === State.DEAD ? colors.error : colors.nodeActive) : colors.border}`,
                        background: active ? colors.nodeIdle : "transparent",
                        color: active ? colors.textPrimary : to === State.DEAD ? colors.nodeIdleBorder : colors.textSecondary,
                        fontWeight: active ? 700 : 400,
                      }}
                    >
                      {SHORT[to]}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ textAlign: "center", marginTop: 6, fontFamily: fonts.base, fontSize: 10.5, color: colors.textSecondary }}>
        δ is total: {STATES.length} × {CLASSES.length} = {STATES.length * CLASSES.length} entries; · = DEAD (trap). Hover a cell or header for full names.
      </div>
    </div>
  );
}
