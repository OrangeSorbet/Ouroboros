// AST for the extended Snek language (docs/phase34plan.md §7.3). Built by
// the parser from the parse tree: punctuation dropped, one-child chains
// collapsed, operator tails folded left-associatively.
//
// Every node has a program-unique numeric `id` (semantic analysis keys its
// type/resolution maps by it; the UI keys tree nodes by it) and a source
// `span`.
import type { Span } from "./trace.ts";

interface NodeBase {
  id: number;
  span: Span;
}

export interface Program extends NodeBase {
  kind: "Program";
  items: Decl[]; // source order
}

export type Decl = FuncDecl | Stmt;

export interface FuncDecl extends NodeBase {
  kind: "FuncDecl";
  name: string;
  params: Param[];
  body: Block;
}

export interface Param extends NodeBase {
  kind: "Param";
  name: string;
}

export type Stmt =
  | LetStmt
  | AssignStmt
  | PrintStmt
  | IfStmt
  | WhileStmt
  | ForStmt
  | ReturnStmt
  | Block
  | ExprStmt;

export interface LetStmt extends NodeBase {
  kind: "LetStmt";
  name: string;
  value: Expr;
}

// Built when SimpleStmt's optional `= Expr` tail is present. The grammar
// accepts any Expr as target (left-factoring, §7.3); semantic analysis
// rejects targets that aren't Identifier / IndexExpr.
export interface AssignStmt extends NodeBase {
  kind: "AssignStmt";
  target: Expr;
  value: Expr;
}

export interface PrintStmt extends NodeBase {
  kind: "PrintStmt";
  value: Expr;
}

export interface IfStmt extends NodeBase {
  kind: "IfStmt";
  condition: Expr;
  thenBranch: Block;
  elseBranch: Block | null;
}

export interface WhileStmt extends NodeBase {
  kind: "WhileStmt";
  condition: Expr;
  body: Block;
}

// Kept as-is through semantic analysis; desugared to a while-loop in the
// IR phase: { init; while (condition ?? true) { body; update; } }.
export interface ForStmt extends NodeBase {
  kind: "ForStmt";
  init: LetStmt | AssignStmt | ExprStmt | null;
  condition: Expr | null;
  update: AssignStmt | ExprStmt | null; // no trailing ';' in source
  body: Block;
}

export interface ReturnStmt extends NodeBase {
  kind: "ReturnStmt";
  value: Expr | null;
}

export interface Block extends NodeBase {
  kind: "Block";
  statements: Stmt[];
}

export interface ExprStmt extends NodeBase {
  kind: "ExprStmt";
  expr: Expr;
}

export type Expr =
  | BinaryExpr
  | LogicalExpr
  | UnaryExpr
  | CallExpr
  | IndexExpr
  | NumberLiteral
  | StringLiteral
  | BoolLiteral
  | ArrayLiteral
  | Identifier;

export type BinaryOperator = "+" | "-" | "*" | "/" | "==" | "!=" | "<" | ">" | "<=" | ">=";

export interface BinaryExpr extends NodeBase {
  kind: "BinaryExpr";
  operator: BinaryOperator;
  left: Expr;
  right: Expr;
}

// Separate from BinaryExpr because it short-circuits (compiles to jumps).
export interface LogicalExpr extends NodeBase {
  kind: "LogicalExpr";
  operator: "&&" | "||";
  left: Expr;
  right: Expr;
}

export interface UnaryExpr extends NodeBase {
  kind: "UnaryExpr";
  operator: "-" | "!";
  operand: Expr;
}

export interface CallExpr extends NodeBase {
  kind: "CallExpr";
  callee: Expr; // semantic analysis requires an Identifier naming a function
  args: Expr[];
}

export interface IndexExpr extends NodeBase {
  kind: "IndexExpr";
  object: Expr;
  index: Expr;
}

export interface NumberLiteral extends NodeBase {
  kind: "NumberLiteral";
  value: bigint; // unbounded integers (§5.17)
}

export interface StringLiteral extends NodeBase {
  kind: "StringLiteral";
  value: string; // unescaped
}

export interface BoolLiteral extends NodeBase {
  kind: "BoolLiteral";
  value: boolean;
}

export interface ArrayLiteral extends NodeBase {
  kind: "ArrayLiteral";
  elements: Expr[];
}

export interface Identifier extends NodeBase {
  kind: "Identifier";
  name: string;
}

export type AstNode = Program | Decl | Param | Stmt | Expr;
