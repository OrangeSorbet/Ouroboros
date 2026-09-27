import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";
import type { Token } from "../compiler/tokens";

interface ParserTokenPanelProps {
  tokens: Token[];
  currentIndex?: number;
}

// The full token list (parsing sees all of them at once, unlike the lexer
// which discovers them one at a time), current lookahead highlighted in place.
export function ParserTokenPanel({ tokens, currentIndex }: ParserTokenPanelProps) {
  const real = tokens.filter((t) => t.kind !== "EOF");

  return (
    <div style={{ padding: "0 14px 14px" }}>
      <div style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary, marginBottom: 8 }}>
        tokens (all, from lexing)
      </div>
      <div
        style={{
          maxHeight: "50vh",
          overflowY: "auto",
          background: colors.panelBackground,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          fontFamily: fonts.mono,
          fontSize: 11,
        }}
      >
        {real.map((tok, i) => {
          const isCurrent = i === currentIndex;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                padding: "4px 10px",
                background: isCurrent ? colors.codeLineHighlight : "transparent",
                borderLeft: isCurrent ? `3px solid ${colors.nodeActive}` : "3px solid transparent",
                color: isCurrent ? colors.textPrimary : colors.textSecondary,
              }}
            >
              <span style={{ color: colors.accent, fontWeight: isCurrent ? 700 : 400 }}>{tok.kind}</span>
              <span style={{ opacity: 0.85 }}>'{tok.lexeme}'</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
