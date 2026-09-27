import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";
import type { DfaStep } from "../compiler/lexer";

interface TokenStreamProps {
  steps: DfaStep[];
  uptoIndex: number;
}

// The lexer's actual output: tokens accumulate strictly in source order
// (lex() scans left-to-right and never reorders), one entry per emission
// in the trace so far. This is the thing Syntax Analysis actually reads.
export function TokenStream({ steps, uptoIndex }: TokenStreamProps) {
  const emitted = steps
    .slice(0, uptoIndex + 1)
    .filter((s) => s.emitted)
    .map((s) => s.emitted!);

  return (
    <div
      style={{
        position: "absolute",
        top: 128,
        right: 16,
        zIndex: 25,
        width: 220,
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
        tokens emitted (source order)
      </div>
      {emitted.length === 0 && (
        <div style={{ padding: "10px", color: colors.textSecondary, opacity: 0.6 }}>none yet</div>
      )}
      {emitted.map((tok, i) => {
        const isLatest = i === emitted.length - 1;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              padding: "4px 10px",
              background: isLatest ? colors.codeLineHighlight : "transparent",
              borderLeft: isLatest ? `3px solid ${colors.nodeActive}` : "3px solid transparent",
              color: isLatest ? colors.textPrimary : colors.textSecondary,
            }}
          >
            <span style={{ color: colors.accent, fontWeight: isLatest ? 700 : 400 }}>{tok.kind}</span>
            <span style={{ opacity: 0.85 }}>'{tok.lexeme}'</span>
          </div>
        );
      })}
    </div>
  );
}
