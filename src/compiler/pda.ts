// The parser's call graph as an actual pushdown automaton: one state per
// non-terminal in snek-grammar.md (15 total), edges are "this rule calls
// that rule" (a push), so traversing an edge and later returning back
// along it is exactly a PDA push/pop pair. Kept separate from parser.ts
// the same way dfa.ts is kept separate from lexer.ts — this is the source
// of truth the graph UI renders directly, not scanning/parsing logic.
import type { PdaStep } from "./parser";

export const PDA_SYMBOLS = [
  "Program", "Statement",
  "LetStmt", "AssignStmt", "PrintStmt", "IfStmt", "WhileStmt", "Block", "ExprStmt",
  "Equality", "Comparison", "Additive", "Multiplicative", "Unary", "Primary",
] as const;
export type PdaSymbol = (typeof PDA_SYMBOLS)[number];

export interface PdaEdge {
  from: PdaSymbol;
  to: PdaSymbol;
  // The lookahead condition that selects this production — the "input
  // symbol" component of a formal PDA transition delta(state, input,
  // stack-top) = (state', push). "—" marks an unconditional descent (every
  // expression-precedence level always calls the next one down).
  trigger: string;
  // A "recurse" edge points back up toward a rule that's already an
  // ancestor on the stack (Block re-entering Statement, a parenthesized
  // Primary re-entering Equality) — the same back-edge-to-restart idea as
  // the DFA's epsilon transitions, just for grammar recursion instead of
  // token restart.
  recurse?: boolean;
}

export const PDA_EDGES: PdaEdge[] = [
  { from: "Program", to: "Statement", trigger: "any statement-starting token" },
  { from: "Statement", to: "LetStmt", trigger: "LET" },
  { from: "Statement", to: "AssignStmt", trigger: "IDENT '='" },
  { from: "Statement", to: "PrintStmt", trigger: "PRINT" },
  { from: "Statement", to: "IfStmt", trigger: "IF" },
  { from: "Statement", to: "WhileStmt", trigger: "WHILE" },
  { from: "Statement", to: "Block", trigger: "LBRACE" },
  { from: "Statement", to: "ExprStmt", trigger: "(else)" },
  { from: "LetStmt", to: "Equality", trigger: "after '='" },
  { from: "AssignStmt", to: "Equality", trigger: "after '='" },
  { from: "PrintStmt", to: "Equality", trigger: "after 'print'" },
  { from: "IfStmt", to: "Equality", trigger: "after '('" },
  { from: "IfStmt", to: "Block", trigger: "after ')'" },
  { from: "WhileStmt", to: "Equality", trigger: "after '('" },
  { from: "WhileStmt", to: "Block", trigger: "after ')'" },
  { from: "Block", to: "Statement", trigger: "until '}'", recurse: true },
  { from: "ExprStmt", to: "Equality", trigger: "—" },
  { from: "Equality", to: "Comparison", trigger: "—" },
  { from: "Comparison", to: "Additive", trigger: "—" },
  { from: "Additive", to: "Multiplicative", trigger: "—" },
  { from: "Multiplicative", to: "Unary", trigger: "—" },
  { from: "Unary", to: "Primary", trigger: "—" },
  { from: "Primary", to: "Equality", trigger: "LPAREN", recurse: true },
];

// The exact edge a step traverses: on push, the caller is the symbol just
// below the new top of stack; on pop, the caller is whatever's still on
// top after the popped symbol is removed. Either way it's the same
// parent<->child pair, so a push and its matching pop light up the same edge.
export function activePdaEdgeKey(step?: PdaStep): string | undefined {
  if (!step) return undefined;
  const stack = step.stackAfter;
  const parent = step.action === "push" ? stack[stack.length - 2] : stack[stack.length - 1];
  if (!parent) return undefined;
  return `${parent}->${step.symbol}`;
}

export function edgeKey(from: string, to: string): string {
  return `${from}->${to}`;
}
