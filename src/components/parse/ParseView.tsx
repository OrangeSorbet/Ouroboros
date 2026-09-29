import { useState } from "preact/hooks";
import type { PdaStep, ParseOutput } from "../../compiler/parser";
import type { PhaseResult } from "../../compiler/trace";
import type { Token } from "../../compiler/tokens";
import { PARSE_UI } from "../../compiler/messages/parse";
import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";
import { TabBar } from "../lex/TabBar";
import { DerivationStrip } from "./DerivationStrip";
import { ParseTreePane } from "./ParseTreePane";
import { Ll1Table } from "./Ll1Table";
import { CallGraphPane } from "./CallGraphPane";
import { GrammarPane } from "./GrammarPane";
import { PdaConfig } from "./PdaConfig";

interface ParseViewProps {
  result: PhaseResult<PdaStep, ParseOutput>;
  index: number;
  tokens: Token[];
}

type Tab = "tree" | "table" | "calls" | "grammar";
const TABS = (Object.keys(PARSE_UI.tabs) as Tab[]).map((id) => ({ id, label: PARSE_UI.tabs[id] }));

// Syntax analysis (plan §9.5): the derivation strip on top, the main
// picture (parse tree / LL(1) table / call graph / grammar) on the left, and
// the formal PDA configuration — stack + remaining input — on the right.
export function ParseView({ result, index, tokens }: ParseViewProps) {
  const [tab, setTab] = useState<Tab>("tree");
  const step = result.trace[index];

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: colors.background }}>
      <DerivationStrip step={step} />
      <div className="rsp-row" style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 6, borderBottom: `1px solid ${colors.border}` }}>
            <TabBar tabs={TABS} value={tab} onChange={setTab} />
            {step.move === "error" && result.error && (
              <div
                style={{
                  marginLeft: "auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  padding: "3px 10px", borderRadius: 6, border: `1px solid ${colors.error}`,
                  color: colors.error, fontFamily: fonts.mono, fontSize: 11,
                }}
                title={result.error.message}
              >
                {result.error.message}
              </div>
            )}
          </div>
          <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
            {tab === "tree" && <ParseTreePane result={result} index={index} />}
            {tab === "table" && <Ll1Table step={step} />}
            {tab === "calls" && <CallGraphPane step={step} />}
            {tab === "grammar" && <GrammarPane step={step} />}
          </div>
        </div>
        <PdaConfig step={step} tokens={tokens} />
      </div>
    </div>
  );
}
