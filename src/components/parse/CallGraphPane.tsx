import { useMemo } from "preact/hooks";
import type { PdaStep } from "../../compiler/parser";
import { CALL_EDGES, CALL_NODES, callFrames } from "../../compiler/callGraph";
import { PARSE_UI } from "../../compiler/messages/parse";
import { ElkGraph } from "../graph/ElkGraph";
import type { GraphEdge, GraphNode, NodeStatus } from "../graph/types";
import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";

// View A (plan §5.9): the grammar's call graph, with the rules currently "in
// progress" — the non-helper ancestors of the current parse-tree node, i.e.
// the call stack a recursive-descent parser would have — lit up, and their
// dotted rules listed innermost-last.
export function CallGraphPane({ step }: { step: PdaStep }) {
  const frames = useMemo(
    () => (step.treeNodeId === undefined ? [] : callFrames(step.tree, step.treeNodeId, step.move)),
    [step],
  );
  const onStack = new Set(frames.map((f) => f.symbol));
  const cur = frames.at(-1)?.symbol;
  const caller = frames.at(-2)?.symbol;

  const nodes: GraphNode[] = CALL_NODES.map((s) => {
    const status: NodeStatus = s === cur ? (step.move === "error" ? "error" : "active") : onStack.has(s) ? "done" : "idle";
    return { id: s, label: s, shape: "box", status };
  });
  const edges: GraphEdge[] = CALL_EDGES.map((e) => ({
    id: `${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
    tone: e.from === e.to ? "back" : undefined,
    status: e.from === caller && e.to === cur ? "active" : onStack.has(e.from) && onStack.has(e.to) ? undefined : "dim",
  }));

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex" }}>
      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        <ElkGraph nodes={nodes} edges={edges} direction="DOWN" />
      </div>
      <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: `1px solid ${colors.border}`, background: colors.panelBackground }}>
        <div style={{ padding: "6px 10px", fontFamily: fonts.base, fontSize: 10.5, color: colors.textSecondary, borderBottom: `1px solid ${colors.border}` }}>
          {PARSE_UI.callNote}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px", fontFamily: fonts.mono, fontSize: 10.5 }}>
          {frames.map((f, i) => {
            const top = i === frames.length - 1;
            return (
              <div
                key={f.nodeId}
                style={{
                  padding: "2px 6px", marginBottom: 2, borderRadius: 4, paddingLeft: 6 + Math.min(i, 12) * 6,
                  borderLeft: `3px solid ${top ? colors.nodeActive : "transparent"}`,
                  background: top ? colors.codeLineHighlight : "transparent",
                  color: top ? colors.textPrimary : colors.textSecondary,
                }}
              >
                {f.dotted}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
