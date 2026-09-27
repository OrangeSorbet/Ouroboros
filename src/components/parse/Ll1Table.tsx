import { useEffect, useRef } from "preact/hooks";
import type { PdaStep } from "../../compiler/parser";
import { NON_TERMINALS, PRODUCTIONS, TERMINALS, TERMINAL_TEXT, isHelper, isNonTerminal, productionText } from "../../compiler/grammar";
import { TABLE } from "../../compiler/ll1";
import { PARSE_UI } from "../../compiler/messages/parse";
import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";

const cellBase = { padding: "2px 5px", borderRight: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}`, textAlign: "center" } as const;

// M[non-terminal, lookahead] → production number. The cell consulted by the
// current expand (or found empty by an error) is highlighted; match steps
// don't consult the table at all — a terminal on top is compared directly.
export function Ll1Table({ step }: { step: PdaStep }) {
  const row = isNonTerminal(step.top) && (step.move === "expand" || step.move === "error") ? step.top : undefined;
  const col = step.lookahead.kind;
  const curRef = useRef<HTMLTableCellElement>(null);
  useEffect(() => curRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" }), [row, col]);

  const pid = row ? TABLE[row][col] : undefined;
  const caption = row
    ? `M[${row}, ${TERMINAL_TEXT[col]}] = ${pid === undefined ? "∅ (syntax error)" : `#${pid}  ${productionText(PRODUCTIONS[pid])}`}`
    : `${step.move}: ${PARSE_UI.tableSkipped}`;

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", fontFamily: fonts.mono, fontSize: 10.5 }}>
      <div style={{ padding: "4px 10px", borderBottom: `1px solid ${colors.border}`, color: step.move === "error" ? colors.error : colors.textPrimary }}>
        {caption}
        <span style={{ marginLeft: 12, color: colors.textSecondary, fontFamily: fonts.base }}>{PARSE_UI.tableNote}</span>
      </div>
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, color: colors.textSecondary }}>
          <thead>
            <tr>
              <th style={{ ...cellBase, position: "sticky", top: 0, left: 0, zIndex: 2, background: colors.panelBackground }} />
              {TERMINALS.map((t) => (
                <th key={t} style={{ ...cellBase, position: "sticky", top: 0, zIndex: 1, background: colors.panelBackground, color: t === col ? colors.nodeActive : colors.codeKeyword }}>
                  {TERMINAL_TEXT[t]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NON_TERMINALS.map((nt) => (
              <tr key={nt}>
                <th
                  style={{
                    ...cellBase, textAlign: "left", position: "sticky", left: 0, zIndex: 1, background: colors.panelBackground,
                    color: nt === row ? colors.nodeActive : colors.textPrimary, opacity: isHelper(nt) && nt !== row ? 0.6 : 1,
                  }}
                >
                  {nt}
                </th>
                {TERMINALS.map((t) => {
                  const p = TABLE[nt][t];
                  const cur = nt === row && t === col;
                  return (
                    <td
                      key={t}
                      ref={cur ? curRef : undefined}
                      title={p === undefined ? undefined : productionText(PRODUCTIONS[p])}
                      style={{
                        ...cellBase,
                        background: cur ? (p === undefined ? colors.error : colors.nodeActive) : nt === row || t === col ? colors.codeLineHighlight : "transparent",
                        color: cur ? colors.textPrimary : colors.textSecondary,
                        fontWeight: cur ? 700 : 400,
                      }}
                    >
                      {p ?? ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
