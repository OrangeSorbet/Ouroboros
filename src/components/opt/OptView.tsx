import { useMemo } from "preact/hooks";
import { colors } from "../../styles/colors";
import type { PhaseResult } from "../../compiler/trace";
import type { OptOutput, OptStep } from "../../compiler/optimize";
import type { EdgeTone, GraphEdge, GraphNode } from "../graph/types";
import { ElkGraph } from "../graph/ElkGraph";

interface OptViewProps {
  result: PhaseResult<OptStep, OptOutput>;
  index: number;
}

// Phase 5 view: the control-flow graph of the current code object. Blocks
// appear one by one, then their edges; during rewriting the block a rule
// fires in is active and blocks DCE is about to delete are dimmed.
export function OptView({ result, index }: OptViewProps) {
  const step = result.trace[index];
  const graph = useMemo(() => {
    if (step.action === "leaders") {
      // Before blocks exist: one box listing the code, leaders marked ▶.
      const leaders = new Set(step.leaders);
      const nodes: GraphNode[] = [{
        id: "code", label: step.code, shape: "box", status: "active",
        lines: step.rows.map((r, i) => `${leaders.has(i) ? "▶" : " "} ${i} ${r.text}`),
      }];
      return { nodes, edges: [] as GraphEdge[] };
    }
    const dead = new Set(step.deadBlocks ?? []);
    const nodes: GraphNode[] = step.blocks.map((b) => ({
      id: `B${b.id}`, label: `B${b.id}  #${b.start}–#${b.end}`, shape: "box", lines: b.instrs,
      status: dead.has(b.id) ? "dim" : b.id === step.activeBlock ? "active" : "idle",
    }));
    const edges: GraphEdge[] = step.edges.map((e, i) => {
      const tone: EdgeTone = e.back ? "back" : e.kind === "true" || e.kind === "next" ? "true" : e.kind === "false" || e.kind === "done" ? "false" : "default";
      return {
        id: `${step.code}-${i}-${e.from}-${e.to}`, source: `B${e.from}`, target: `B${e.to}`,
        label: e.kind === "fall" ? undefined : e.kind, tone,
        status: dead.has(e.from) || dead.has(e.to) ? "dim" : step.action === "edges" && e.from === step.activeBlock ? "active" : "idle",
      };
    });
    return { nodes, edges };
  }, [step]);

  return (
    <div style={{ position: "absolute", inset: 0, background: colors.background }}>
      <ElkGraph nodes={graph.nodes} edges={graph.edges} direction="DOWN" emptyText="no instructions" />
    </div>
  );
}
