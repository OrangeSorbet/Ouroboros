import { useMemo } from "preact/hooks";
import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";
import type { Program } from "../../compiler/ast";
import type { PhaseResult } from "../../compiler/trace";
import type { SemanticInfo } from "../../compiler/semanticTypes";
import type { SemStep } from "../../compiler/semantic";
import type { NodeStatus } from "../graph/types";
import { ElkGraph } from "../graph/ElkGraph";
import { buildAstGraph, itemIndexById } from "./astGraph";
import { ScopeStack } from "./ScopeStack";
import { SEM_ERROR_BANNER } from "../../compiler/messages/semantic";

interface SemanticViewProps {
  result: PhaseResult<SemStep, SemanticInfo>;
  index: number;
  ast: Program;
}

// Phase 3 view: the current top-level item's AST (type badges appear as the
// walk checks each expression) beside the symbol-table scope stack.
export function SemanticView({ result, index, ast }: SemanticViewProps) {
  const step = result.trace[index];
  const itemOf = useMemo(() => itemIndexById(ast), [ast]);
  const typeFinal = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of result.trace) if (s.nodeId !== undefined && s.nodeType) m.set(s.nodeId, s.nodeType);
    return m;
  }, [result]);

  const graph = useMemo(() => {
    const itemIdx = step.nodeId !== undefined ? itemOf.get(step.nodeId) : undefined;
    const item = itemIdx !== undefined ? ast.items[itemIdx] : undefined;
    if (!item) return { nodes: [], edges: [] };
    const typeNow = new Map<number, string>();
    const visited = new Set<number>();
    for (let i = 0; i <= index; i++) {
      const s = result.trace[i];
      if (s.nodeId === undefined) continue;
      visited.add(s.nodeId);
      if (s.nodeType) typeNow.set(s.nodeId, s.nodeType);
    }
    const statusOf = (id: number): NodeStatus =>
      id === step.nodeId ? (step.action === "error" ? "error" : "active") : visited.has(id) ? "done" : "idle";
    return buildAstGraph(item, typeNow, typeFinal, statusOf);
  }, [ast, itemOf, typeFinal, result, index, step]);

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", background: colors.background }}>
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <ElkGraph nodes={graph.nodes} edges={graph.edges} direction="DOWN" emptyText="no AST node for this step" />
      </div>
      <div
        style={{
          width: 240,
          flexShrink: 0,
          borderLeft: `1px solid ${colors.border}`,
          background: colors.panelBackground,
          overflowY: "auto",
        }}
      >
        {step.action === "error" && (
          <div style={{ margin: 8, padding: "5px 8px", border: `1px solid ${colors.error}`, borderRadius: 6, color: colors.error, fontFamily: fonts.mono, fontSize: 11 }}>
            {SEM_ERROR_BANNER}
          </div>
        )}
        <ScopeStack step={step} />
      </div>
    </div>
  );
}
