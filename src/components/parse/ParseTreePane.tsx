import { useMemo, useState } from "preact/hooks";
import type { PdaStep, ParseNode, ParseOutput } from "../../compiler/parser";
import type { PhaseResult } from "../../compiler/trace";
import type { AstNode } from "../../compiler/ast";
import { symText } from "../../compiler/grammar";
import { ancestors } from "../../compiler/callGraph";
import { PARSE_UI } from "../../compiler/messages/parse";
import { ElkGraph } from "../graph/ElkGraph";
import type { GraphEdge, GraphNode, NodeStatus } from "../graph/types";
import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";
import { TabBar } from "../lex/TabBar";

type Mode = "tree" | "ast";
const MODES = (Object.keys(PARSE_UI.treeToggle) as Mode[]).map((id) => ({ id, label: PARSE_UI.treeToggle[id] }));
const VALUE_KINDS = new Set(["IDENT", "NUMBER", "STRING"]);

// The parse tree as it stood at trace index `index`: nodes appear when the
// expand that created them runs (createdAt) and turn "done" once expanded or
// matched (doneAt). Only the current top-level Decl's subtree is drawn — a
// whole program's tree is hundreds of nodes; outside any Decl (the first and
// last few steps) the Program spine is shown with each Decl collapsed.
function treeGraph(root: ParseNode, step: PdaStep, index: number) {
  const chain = step.treeNodeId === undefined ? [root] : ancestors(root, step.treeNodeId);
  const focus = chain.find((n) => n.symbol === "Decl") ?? root;
  const collapseDecls = focus === root;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const walk = (n: ParseNode) => {
    const done = n.doneAt !== undefined && n.doneAt <= index;
    const status: NodeStatus =
      n.id === step.treeNodeId ? (step.move === "error" ? "error" : "active")
      : n.helper || n.symbol === "ε" ? "dim"
      : done ? "done" : "idle";
    nodes.push({
      id: String(n.id),
      label: symText(n.symbol),
      sublabel: done && n.token && VALUE_KINDS.has(n.token.kind) ? n.token.lexeme : undefined,
      shape: "box",
      status,
    });
    if (collapseDecls && n.symbol === "Decl" && n !== focus) return;
    for (const c of n.children) {
      if (c.createdAt > index) continue;
      edges.push({ id: `${n.id}-${c.id}`, source: String(n.id), target: String(c.id), status: status === "dim" ? "dim" : undefined });
      walk(c);
    }
  };
  walk(focus);
  return { nodes, edges };
}

function describeAst(n: AstNode): string | undefined {
  if ("name" in n) return n.name;
  if ("operator" in n) return n.operator;
  if ("value" in n && typeof n.value !== "object") return String(n.value);
  return undefined;
}

// Generic AST walk: any field holding a node (or an array of nodes) is a child,
// and the field name labels the edge — so this never lags behind ast.ts.
function astGraph(root: AstNode) {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const walk = (n: AstNode) => {
    nodes.push({ id: String(n.id), label: n.kind, sublabel: describeAst(n), shape: "box" });
    for (const [key, val] of Object.entries(n)) {
      if (key === "span") continue;
      const kids = Array.isArray(val) ? val : [val];
      kids.forEach((k, i) => {
        if (!k || typeof k !== "object" || !("kind" in k)) return;
        edges.push({ id: `${n.id}-${k.id}`, source: String(n.id), target: String(k.id), label: Array.isArray(val) ? `${key}[${i}]` : key });
        walk(k as AstNode);
      });
    }
  };
  walk(root);
  return { nodes, edges };
}

export function ParseTreePane({ result, index }: { result: PhaseResult<PdaStep, ParseOutput>; index: number }) {
  const [mode, setMode] = useState<Mode>("tree");
  const step = result.trace[index];
  const chapter = Math.max(0, result.chapters.findIndex((c) => index >= c.start && index <= c.end));
  const ast = result.output?.ast;

  const graph = useMemo(() => {
    if (mode === "tree") return treeGraph(step.tree, step, index);
    if (!ast) return { nodes: [], edges: [] };
    return astGraph(ast.items[chapter] ?? ast);
  }, [mode, step, index, ast, chapter]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <ElkGraph
        nodes={graph.nodes}
        edges={graph.edges}
        direction="DOWN"
        emptyText={mode === "ast" ? PARSE_UI.noAst : PARSE_UI.emptyTree}
      />
      <div style={{ position: "absolute", top: 8, left: 8, zIndex: 3, display: "flex", alignItems: "center", gap: 8 }}>
        <TabBar tabs={MODES} value={mode} onChange={setMode} />
        {mode === "ast" && ast && (
          <span style={{ fontFamily: fonts.base, fontSize: 10.5, color: colors.textSecondary }}>{PARSE_UI.astNote}</span>
        )}
      </div>
    </div>
  );
}
