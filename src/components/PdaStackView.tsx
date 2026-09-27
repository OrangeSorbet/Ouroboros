import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";
import type { PdaStep } from "../compiler/parser";

interface PdaStackViewProps {
  step?: PdaStep;
}

// The "technical" half of the syntax-analysis split screen: the parser's
// real explicit stack (parser.ts's PdaStep trace), shown as a compact
// column rather than full-screen — it now shares the right pane with the
// token list and current-token bubble.
export function PdaStackView({ step }: PdaStackViewProps) {
  const stack = step?.stackAfter ?? [];

  return (
    <div style={{ padding: "14px 14px 10px" }}>
      <div style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary, marginBottom: 10 }}>
        parser stack (bottom {"->"} top)
      </div>
      <div style={{ display: "flex", flexDirection: "column-reverse", gap: 6, minHeight: 40 }}>
        {stack.length === 0 && (
          <div style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary, opacity: 0.5, textAlign: "center" }}>
            (empty stack)
          </div>
        )}
        {stack.map((symbol, i) => {
          const isTop = i === stack.length - 1;
          return (
            <div
              key={`${symbol}-${i}`}
              style={{
                padding: "7px 10px",
                borderRadius: 7,
                background: isTop ? colors.nodeActive : colors.nodeIdle,
                border: `1.5px solid ${isTop ? colors.nodeActive : colors.nodeIdleBorder}`,
                color: colors.textPrimary,
                fontFamily: fonts.mono,
                fontSize: 12,
                fontWeight: isTop ? 700 : 500,
                textAlign: "center",
                boxShadow: isTop ? `0 0 12px ${colors.nodeActiveGlow}` : "none",
                transition: "background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
              }}
            >
              {symbol}
            </div>
          );
        })}
      </div>
    </div>
  );
}
