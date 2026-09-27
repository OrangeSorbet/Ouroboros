import type { AstNode, Decl, Program } from "../../compiler/ast";
import type { GraphEdge, GraphNode, NodeStatus } from "../graph/types";

type Child = { node: AstNode; role?: string };

// Children in source order, with an edge label only where the role isn't
// obvious from position (statement parts, call/index operands).
function children(n: AstNode): Child[] {
  const c = (node: AstNode | null, role?: string): Child[] => (node ? [{ node, role }] : []);
  switch (n.kind) {
    case "Program": return n.items.map((node) => ({ node }));
    case "FuncDecl": return [...n.params.map((node) => ({ node })), ...c(n.body, "body")];
    case "LetStmt": return c(n.value);
    case "AssignStmt": return [...c(n.target, "target"), ...c(n.value, "value")];
    case "PrintStmt": return c(n.value);
    case "ExprStmt": return c(n.expr);
    case "ReturnStmt": return c(n.value);
    case "IfStmt": return [...c(n.condition, "cond"), ...c(n.thenBranch, "then"), ...c(n.elseBranch, "else")];
    case "WhileStmt": return [...c(n.condition, "cond"), ...c(n.body, "body")];
    case "ForStmt": return [...c(n.init, "init"), ...c(n.condition, "cond"), ...c(n.update, "update"), ...c(n.body, "body")];
    case "Block": return n.statements.map((node) => ({ node }));
    case "BinaryExpr":
    case "LogicalExpr": return [...c(n.left), ...c(n.right)];
    case "UnaryExpr": return c(n.operand);
    case "CallExpr": return [...c(n.callee, "callee"), ...n.args.map((node) => ({ node, role: "arg" }))];
    case "IndexExpr": return [...c(n.object, "array"), ...c(n.index, "index")];
    case "ArrayLiteral": return n.elements.map((node) => ({ node }));
    default: return [];
  }
}

function label(n: AstNode): string {
  switch (n.kind) {
    case "FuncDecl": return `fn ${n.name}(${n.params.map((p) => p.name).join(", ")})`;
    case "Param": return `param ${n.name}`;
    case "LetStmt": return `let ${n.name}`;
    case "AssignStmt": return "=";
    case "PrintStmt": return "print";
    case "ExprStmt": return "expr ;";
    case "ReturnStmt": return "return";
    case "IfStmt": return "if";
    case "WhileStmt": return "while";
    case "ForStmt": return "for";
    case "Block": return "{ }";
    case "BinaryExpr":
    case "LogicalExpr":
    case "UnaryExpr": return n.operator;
    case "CallExpr": return "call";
    case "IndexExpr": return "[ ]";
    case "NumberLiteral": return n.value.toString();
    case "StringLiteral": return JSON.stringify(n.value);
    case "BoolLiteral": return String(n.value);
    case "ArrayLiteral": return "[ … ]";
    case "Identifier": return n.name;
    case "Program": return "program";
  }
}

const isExpr = (n: AstNode) => /Expr$|Literal$|^Identifier$/.test(n.kind) && n.kind !== "ExprStmt";

// Every node id → index of the top-level item that contains it, so the view
// can show just the subtree the current step belongs to.
export function itemIndexById(ast: Program): Map<number, number> {
  const m = new Map<number, number>();
  const visit = (n: AstNode, i: number) => {
    m.set(n.id, i);
    for (const ch of children(n)) visit(ch.node, i);
  };
  ast.items.forEach((item, i) => visit(item, i));
  return m;
}

export const badge = (type: string) => type.replace(/unknown/g, "?");

// Expr nodes always carry a sublabel ("·" until typed) and a width fixed by
// their final badge, so revealing a type never changes node sizes — the
// layout stays put while badges appear.
export function buildAstGraph(
  item: Decl,
  typeNow: Map<number, string>,
  typeFinal: Map<number, string>,
  statusOf: (id: number) => NodeStatus,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const visit = (n: AstNode) => {
    const text = label(n);
    const expr = isExpr(n);
    const finalBadge = typeFinal.get(n.id);
    const now = typeNow.get(n.id);
    nodes.push({
      id: String(n.id),
      label: text,
      sublabel: expr ? (now ? badge(now) : "·") : undefined,
      shape: "box",
      status: statusOf(n.id),
      width: expr ? Math.max(56, 8 * Math.max(text.length, finalBadge ? badge(finalBadge).length : 1) + 28) : undefined,
    });
    for (const ch of children(n)) {
      edges.push({ id: `${n.id}-${ch.node.id}`, source: String(n.id), target: String(ch.node.id), label: ch.role });
      visit(ch.node);
    }
  };
  visit(item);
  return { nodes, edges };
}
