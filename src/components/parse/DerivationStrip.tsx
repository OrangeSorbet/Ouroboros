import type { PdaStep } from "../../compiler/parser";
import { isNonTerminal, symText } from "../../compiler/grammar";
import { PARSE_UI } from "../../compiler/messages/parse";
import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";

// The current sentential form of the leftmost derivation (plan §5.13): for a
// top-down PDA it is simply the tokens matched so far followed by the stack
// read top-to-bottom. The matched side keeps its newest tokens visible by
// right-aligning and clipping on the left.
export function DerivationStrip({ step }: { step: PdaStep }) {
  const stack = [...step.stackAfter].reverse();
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8, height: 26, flexShrink: 0, padding: "0 10px",
        borderBottom: `1px solid ${colors.border}`, background: colors.panelBackground,
        fontFamily: fonts.mono, fontSize: 11, whiteSpace: "nowrap",
      }}
    >
      <span style={{ color: colors.textSecondary, fontFamily: fonts.base, fontSize: 10.5, flexShrink: 0 }}>{PARSE_UI.derivation}</span>
      <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", overflow: "hidden", color: colors.accent }}>
        {step.matched.join(" ")}
      </div>
      <span style={{ color: colors.nodeActive, fontWeight: 700 }}>│</span>
      <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
        {stack.length === 0 && <span style={{ color: colors.textSecondary }}>ε</span>}
        {stack.map((s, i) => (
          <span key={i} style={{ color: isNonTerminal(s) ? colors.textPrimary : colors.codeKeyword, fontWeight: i === 0 ? 700 : 400, marginRight: 6 }}>
            {symText(s)}
          </span>
        ))}
      </div>
    </div>
  );
}
