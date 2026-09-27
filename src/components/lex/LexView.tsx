import { useMemo, useState } from "preact/hooks";
import { ACCEPTING, CLASSES, CLASS_LABELS, STATES, State, TRANSITIONS } from "../../compiler/dfa";
import type { CharClass } from "../../compiler/dfa";
import type { DfaStep } from "../../compiler/lexer";
import type { PhaseResult } from "../../compiler/trace";
import type { Token } from "../../compiler/tokens";
import { ElkGraph } from "../graph/ElkGraph";
import type { GraphEdge, GraphNode, NodeStatus } from "../graph/types";
import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";
import { InputTape } from "./InputTape";
import { DeltaTable } from "./DeltaTable";
import { FiveTuple, actionLabel, currentState } from "./FiveTuple";
import { TokenList } from "./TokenList";
import { TabBar } from "./TabBar";

interface LexViewProps {
  result: PhaseResult<DfaStep, Token[]>;
  index: number;
  source: string;
}

// Edge label = the actual symbol set. A set covering most of Σ reads better
// as its complement ("Σ∖{*}"); `n`/`t` rejoin the letters when both go the
// same way, since they are only split off for string escapes.
function edgeLabel(classes: CharClass[]): string {
  if (classes.length > CLASSES.length / 2)
    return `Σ∖{${CLASSES.filter((c) => !classes.includes(c)).map((c) => CLASS_LABELS[c]).join(" ")}}`;
  const both = classes.includes("letter") && classes.includes("escLetter");
  return classes
    .filter((c) => !(both && c === "escLetter"))
    .map((c) => (both && c === "letter" ? "[a-zA-Z_]" : CLASS_LABELS[c]))
    .join(" ");
}

// Every non-DEAD δ entry, grouped by (from, to) into one labelled edge.
// DEAD's own self-loop on Σ is stated in its sublabel instead of drawn.
const BASE_EDGES: GraphEdge[] = (() => {
  const groups = new Map<string, { from: State; to: State; classes: CharClass[] }>();
  for (const from of STATES) {
    if (from === State.DEAD) continue;
    for (const [cls, to] of Object.entries(TRANSITIONS[from] ?? {}) as [CharClass, State][]) {
      const id = `${from}->${to}`;
      if (!groups.has(id)) groups.set(id, { from, to, classes: [] });
      groups.get(id)!.classes.push(cls);
    }
  }
  return [...groups].map(([id, g]) => ({ id, source: g.from, target: g.to, label: edgeLabel(g.classes) }));
})();

const TABS_MAIN = [{ id: "graph", label: "DFA graph" }, { id: "table", label: "δ table" }] as const;
const TABS_SIDE = [{ id: "tokens", label: "tokens" }, { id: "tuple", label: "5-tuple" }] as const;

export function LexView({ result, index, source }: LexViewProps) {
  const [main, setMain] = useState<"graph" | "table">("graph");
  const [side, setSide] = useState<"tokens" | "tuple">("tokens");
  const { trace } = result;
  const step = trace[index];
  const q = currentState(step);

  // A DEAD edge is drawn only once the run has actually been trapped (the
  // dying error step), so a successful lex never shows one and the layout
  // re-flows at most once.
  const deadStep = trace.slice(0, index + 1).find((s) => s.kind === "error" && s.to === State.DEAD);

  const edges = useMemo<GraphEdge[]>(() => {
    const list = BASE_EDGES.map((e) => ({
      ...e,
      status: step.kind === "move" && e.id === `${step.from}->${step.to}` ? ("active" as const) : undefined,
    }));
    if (deadStep) {
      list.push({
        id: `${deadStep.from}->DEAD`, source: deadStep.from, target: State.DEAD,
        label: deadStep.cls ? CLASS_LABELS[deadStep.cls] : "", tone: "error", status: deadStep === step ? "active" : undefined,
      });
    }
    return list;
  }, [step, deadStep]);

  const nodes = useMemo<GraphNode[]>(() => {
    // States visited by the current run (steps sharing this lexeme start).
    const visited = new Set<string>();
    for (let j = index; j >= 0 && trace[j].start === step.start; j--) {
      visited.add(trace[j].from);
      if (trace[j].kind === "move") visited.add(trace[j].to);
    }
    return STATES.map((s) => {
      const action = ACCEPTING[s];
      const status: NodeStatus =
        s === q ? (step.kind === "error" ? "error" : "active") : visited.has(s) ? "done" : "idle";
      return {
        id: s,
        label: s,
        sublabel: action ? actionLabel(action) : s === State.DEAD ? "trap · loops on Σ" : undefined,
        shape: action ? "doubleCircle" : "circle",
        status,
      };
    });
  }, [index, trace, step, q]);

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: colors.background }}>
      <InputTape source={source} step={step} />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          {main === "graph" ? (
            <ElkGraph nodes={nodes} edges={edges} direction="RIGHT" startNodeId={State.START} />
          ) : (
            <DeltaTable step={step} />
          )}
          <div style={{ position: "absolute", top: 8, left: 8, zIndex: 3 }}>
            <TabBar tabs={TABS_MAIN} value={main} onChange={setMain} />
          </div>
          {step.kind === "error" && result.error && (
            <div
              style={{
                position: "absolute", top: 8, right: 8, zIndex: 3, maxWidth: "60%",
                padding: "4px 10px", borderRadius: 6, border: `1px solid ${colors.error}`,
                background: colors.panelBackground, color: colors.error, fontFamily: fonts.mono, fontSize: 11,
              }}
            >
              lexical error at {result.error.span?.line}:{result.error.span?.col} — {result.error.message}
            </div>
          )}
        </div>
        <div style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: `1px solid ${colors.border}`, background: colors.panelBackground }}>
          <div style={{ padding: 6, borderBottom: `1px solid ${colors.border}` }}>
            <TabBar tabs={TABS_SIDE} value={side} onChange={setSide} />
          </div>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {side === "tokens" ? <TokenList trace={trace} index={index} /> : <FiveTuple step={step} />}
          </div>
        </div>
      </div>
    </div>
  );
}
