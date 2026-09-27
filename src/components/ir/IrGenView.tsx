import { useMemo } from "preact/hooks";
import { colors } from "../../styles/colors";
import type { Decl, Program } from "../../compiler/ast";
import type { PhaseResult } from "../../compiler/trace";
import type { IrProgram } from "../../compiler/irTypes";
import type { IrGenStep } from "../../compiler/irgen";
import type { NodeStatus } from "../graph/types";
import { ElkGraph } from "../graph/ElkGraph";
import { buildAstGraph } from "../semantic/astGraph";

interface IrGenViewProps {
  result: PhaseResult<IrGenStep, IrProgram>;
  index: number;
  ast: Program;
}

const NO_TYPES = new Map<number, string>();

// Phase 4 view: the AST of the top-level item being translated. The node
// being entered/emitted is active; nodes whose code is complete are done.
// A top-level `for` is swapped for its desugared while-form once the
// desugar step has run, so the walk that follows matches the picture.
export function IrGenView({ result, index, ast }: IrGenViewProps) {
  const step = result.trace[index];
  const graph = useMemo(() => {
    let item: Decl | undefined = ast.items[step.item];
    if (!item) return { nodes: [], edges: [] };
    const done = new Set<number>();
    for (let i = 0; i <= index; i++) {
      const s = result.trace[i];
      if (s.item !== step.item) continue;
      for (const id of s.finished) done.add(id);
      if (s.action === "desugar" && s.tree && s.nodeId === item.id) item = s.tree;
    }
    const statusOf = (id: number): NodeStatus =>
      id === step.nodeId ? (step.action === "error" ? "error" : "active") : done.has(id) ? "done" : "idle";
    return buildAstGraph(item, NO_TYPES, NO_TYPES, statusOf);
  }, [ast, result, index, step]);

  return (
    <div style={{ position: "absolute", inset: 0, background: colors.background }}>
      <ElkGraph nodes={graph.nodes} edges={graph.edges} direction="DOWN" emptyText="end of <main>: implicit return" />
    </div>
  );
}
