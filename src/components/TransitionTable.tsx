import { TRANSITIONS, SINGLE_CHAR_TOKENS, CLASS_LABELS } from "../compiler/dfa";
import type { CharClass } from "../compiler/dfa";
import type { DfaStep } from "../compiler/lexer";
import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";

interface TransitionTableProps {
  step?: DfaStep;
}

export function TransitionTable({ step }: TransitionTableProps) {
  const rows: Array<{ state: string; cls: string; next: string }> = [];
  for (const [state, table] of Object.entries(TRANSITIONS)) {
    if (!table) continue;
    for (const [cls, next] of Object.entries(table)) {
      if (next) rows.push({ state, cls, next: next as string });
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 128,
        left: 16,
        zIndex: 25,
        width: 240,
        maxHeight: "55vh",
        overflowY: "auto",
        background: colors.panelBackground,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        fontFamily: fonts.mono,
        fontSize: 11,
      }}
    >
      <div style={{ padding: "8px 10px", borderBottom: `1px solid ${colors.border}`, color: colors.textSecondary }}>
        delta (state, class) -&gt; state
      </div>
      {rows.map((r, i) => {
        const isActive = step && step.from === r.state && step.to === r.next;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "4px 10px",
              background: isActive ? colors.codeLineHighlight : "transparent",
              borderLeft: isActive ? `3px solid ${colors.nodeActive}` : "3px solid transparent",
              color: isActive ? colors.textPrimary : colors.textSecondary,
            }}
          >
            <span>{r.state}</span>
            <span style={{ opacity: 0.7 }}>{CLASS_LABELS[r.cls as CharClass]}</span>
            <span>{r.next}</span>
          </div>
        );
      })}
      <div style={{ padding: "8px 10px", borderTop: `1px solid ${colors.border}`, color: colors.textSecondary }}>
        single-char accept
      </div>
      {Object.entries(SINGLE_CHAR_TOKENS).map(([ch, kind]) => (
        <div key={ch} style={{ display: "flex", justifyContent: "space-between", padding: "4px 10px", color: colors.textSecondary }}>
          <span>'{ch}'</span>
          <span>{kind}</span>
        </div>
      ))}
    </div>
  );
}
