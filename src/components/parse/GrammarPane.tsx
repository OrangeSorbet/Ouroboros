import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { PdaStep } from "../../compiler/parser";
import { GRAMMAR_EBNF, PRODUCTIONS, rhsText } from "../../compiler/grammar";
import { ancestors, callFrames } from "../../compiler/callGraph";
import { PARSE_UI } from "../../compiler/messages/parse";
import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";
import { TabBar } from "../lex/TabBar";

type Mode = "bnf" | "ebnf";
const MODES = (Object.keys(PARSE_UI.grammarToggle) as Mode[]).map((id) => ({ id, label: PARSE_UI.grammarToggle[id] }));

// Both notations of the same grammar. BNF is what the PDA runs on, numbered
// like the LL(1) table; the highlighted production is the one being expanded
// (or, on a match, the one whose right-hand side contains the terminal).
// EBNF highlights the enclosing original rule, since helpers don't exist there.
export function GrammarPane({ step }: { step: PdaStep }) {
  const [mode, setMode] = useState<Mode>("bnf");
  const curRef = useRef<HTMLDivElement>(null);

  const { pid, rule } = useMemo(() => {
    if (step.treeNodeId === undefined) return { pid: undefined, rule: undefined };
    const chain = ancestors(step.tree, step.treeNodeId);
    const pid = step.move === "expand" ? step.production : chain.at(step.move === "accept" ? -1 : -2)?.productionId;
    return { pid, rule: callFrames(step.tree, step.treeNodeId, step.move).at(-1)?.symbol };
  }, [step]);

  useEffect(() => curRef.current?.scrollIntoView({ block: "nearest" }), [pid, rule, mode]);

  const row = (key: string | number, cur: boolean, dim: boolean, content: ComponentChildren) => (
    <div
      key={key}
      ref={cur ? curRef : undefined}
      style={{
        display: "flex", gap: 8, padding: "1px 10px", whiteSpace: "pre",
        background: cur ? colors.codeLineHighlight : "transparent",
        borderLeft: `3px solid ${cur ? colors.nodeActive : "transparent"}`,
        color: cur ? colors.textPrimary : colors.textSecondary,
        opacity: dim && !cur ? 0.55 : 1,
      }}
    >
      {content}
    </div>
  );

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 6, borderBottom: `1px solid ${colors.border}` }}>
        <TabBar tabs={MODES} value={mode} onChange={setMode} />
      </div>
      <div style={{ flex: 1, overflow: "auto", minHeight: 0, padding: "4px 0", fontFamily: fonts.mono, fontSize: 11 }}>
        {mode === "bnf"
          ? PRODUCTIONS.map((p, i) => {
              const firstAlt = i === 0 || PRODUCTIONS[i - 1].lhs !== p.lhs;
              return row(p.id, p.id === pid, p.helper, <>
                <span style={{ width: 22, textAlign: "right", opacity: 0.6 }}>{p.id}</span>
                <span style={{ width: 150, color: colors.textPrimary }}>{firstAlt ? p.lhs : ""}</span>
                <span style={{ width: 14 }}>{firstAlt ? "→" : "|"}</span>
                <span style={{ color: p.id === pid ? colors.textPrimary : colors.codeForeground }}>{rhsText(p)}</span>
              </>);
            })
          : Object.entries(GRAMMAR_EBNF).map(([nt, text]) => row(nt, nt === rule, false, <span>{text}</span>))}
      </div>
    </div>
  );
}
