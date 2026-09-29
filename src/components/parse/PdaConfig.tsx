import { useEffect, useRef } from "preact/hooks";
import type { PdaStep } from "../../compiler/parser";
import type { Token } from "../../compiler/tokens";
import { isHelper, isNonTerminal, symText } from "../../compiler/grammar";
import { PARSE_UI } from "../../compiler/messages/parse";
import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";

const heading = { padding: "6px 10px 4px", fontFamily: fonts.base, fontSize: 10.5, color: colors.textSecondary } as const;

// The formal PDA configuration (state, remaining input, stack). The machine
// has a single state, so the stack and the input head carry everything.
export function PdaConfig({ step, tokens }: { step: PdaStep; tokens: Token[] }) {
  const stack = [...step.stackAfter].reverse(); // top first
  const la = Math.min(step.inputPos, tokens.length - 1);
  const laRef = useRef<HTMLDivElement>(null);
  useEffect(() => laRef.current?.scrollIntoView({ block: "nearest" }), [la]);

  return (
    <div
      className="rsp-side"
      style={{
        width: 250, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0,
        borderLeft: `1px solid ${colors.border}`, background: colors.panelBackground, fontFamily: fonts.mono, fontSize: 11,
      }}
    >
      <div style={{ ...heading, color: colors.textPrimary, fontSize: 11.5, borderBottom: `1px solid ${colors.border}` }}>{PARSE_UI.config}</div>
      <div style={heading}>{PARSE_UI.stack}</div>
      <div style={{ flex: 1, minHeight: 60, overflowY: "auto", padding: "0 10px 6px" }}>
        {stack.length === 0 && <div style={{ color: colors.textSecondary }}>{PARSE_UI.emptyStack}</div>}
        {stack.map((s, i) => {
          const top = i === 0;
          const nt = isNonTerminal(s);
          return (
            <div
              key={stack.length - i}
              style={{
                padding: "2px 8px", marginBottom: 2, borderRadius: 4,
                border: `1px solid ${top ? (step.move === "error" ? colors.error : colors.nodeActive) : colors.border}`,
                background: top ? colors.nodeIdle : "transparent",
                color: nt ? colors.textPrimary : colors.codeKeyword,
                opacity: nt && isHelper(s) && !top ? 0.55 : 1,
                fontWeight: top ? 700 : 400,
              }}
            >
              {symText(s)}
            </div>
          );
        })}
      </div>
      <div style={{ ...heading, borderTop: `1px solid ${colors.border}` }}>{PARSE_UI.input}</div>
      <div style={{ flex: 1, minHeight: 60, overflowY: "auto", paddingBottom: 6 }}>
        {tokens.map((t, i) => {
          const cur = i === la;
          return (
            <div
              key={i}
              ref={cur ? laRef : undefined}
              style={{
                display: "flex", gap: 8, padding: "1px 10px",
                background: cur ? colors.codeLineHighlight : "transparent",
                borderLeft: `3px solid ${cur ? (step.move === "error" ? colors.error : colors.nodeActive) : "transparent"}`,
                color: cur ? colors.textPrimary : colors.textSecondary,
                opacity: i < la ? 0.45 : 1,
              }}
            >
              <span style={{ color: colors.accent, width: 64, flexShrink: 0 }}>{t.kind}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.kind === "EOF" ? "$" : t.lexeme}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
