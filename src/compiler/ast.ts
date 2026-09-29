// AST for the extended Ouroboros language (docs/phase34plan.md §7.3). Built by
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

export type Decl = FuncDecl | ClassDecl | Stmt;

export interface FuncDecl extends NodeBase {
  kind: "FuncDecl";
  name: string;
  priv?: boolean; // methods only (M4)
  params: Param[];
  body: Block;
}

// class Name : Parent { let f = e; fn m(…) { … } } (M3). Methods are
// FuncDecls whose code objects are named "Class.method" and take an
// implicit `self` in slot 0.
export interface ClassDecl extends NodeBase {
  kind: "ClassDecl";
  name: string;
  abstract: boolean;          // M4: cannot be instantiated
  parent: string | null;
  fields: FieldDecl[];
  methods: FuncDecl[];
  abstractMethods: AbstractMethod[]; // M4: signatures a concrete subclass must implement
}

export interface FieldDecl extends NodeBase {
  kind: "FieldDecl";
  name: string;
  priv: boolean;     // M4: visible only inside this class's methods
  init: Expr | null; // null: starts as none
}

export interface AbstractMethod extends NodeBase {
  kind: "AbstractMethod";
  name: string;
  params: Param[];
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
  | ForEachStmt
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

// for x in e { … } (M2): x is a fresh variable in the loop's own scope,
// its slot recorded under this node's id. Desugared to GET_ITER/FOR_ITER.
export interface ForEachStmt extends NodeBase {
  kind: "ForEachStmt";
  name: string;
  iterable: Expr;
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
  | MemberExpr
  | SelfExpr
  | SuperExpr
  | NewExpr
  | NumberLiteral
  | FloatLiteral
  | NoneLiteral
  | StringLiteral
  | BoolLiteral
  | ArrayLiteral
  | ScaleLiteral
  | DenLiteral
  | ClutchLiteral
  | Identifier;

export type BinaryOperator = "+" | "-" | "*" | "/" | "%" | "==" | "!=" | "<" | ">" | "<=" | ">=";

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

// x.name — a field read, or (as a callee) a method call x.name(args).
export interface MemberExpr extends NodeBase {
  kind: "MemberExpr";
  object: Expr;
  name: string;
}

export interface SelfExpr extends NodeBase {
  kind: "SelfExpr";
}

// super.name — only valid as a callee: super.name(args).
export interface SuperExpr extends NodeBase {
  kind: "SuperExpr";
  name: string;
}

export interface NewExpr extends NodeBase {
  kind: "NewExpr";
  className: string;
  args: Expr[];
}

export interface NumberLiteral extends NodeBase {
  kind: "NumberLiteral";
  value: bigint; // unbounded integers (§5.17)
}

export interface FloatLiteral extends NodeBase {
  kind: "FloatLiteral";
  value: number; // IEEE double (M1)
}

export interface NoneLiteral extends NodeBase {
  kind: "NoneLiteral";
  value: null;
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

// @(a, b) — immutable, fixed length (tuple).
export interface ScaleLiteral extends NodeBase {
  kind: "ScaleLiteral";
  elements: Expr[];
}

// @{ k: v, … } — hash map.
export interface DenLiteral extends NodeBase {
  kind: "DenLiteral";
  entries: { key: Expr; value: Expr }[];
}

// @[a, b] — hash set (duplicates collapse at run time).
export interface ClutchLiteral extends NodeBase {
  kind: "ClutchLiteral";
  elements: Expr[];
}

export interface Identifier extends NodeBase {
  kind: "Identifier";
  name: string;
}

export type AstNode = Program | Decl | FieldDecl | AbstractMethod | Param | Stmt | Expr;
