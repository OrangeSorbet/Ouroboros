// AST node types for Snek. One interface per CFG non-terminal /
// production alternative from snek-grammar.md.

export type Stmt =
  | LetStmt
  | AssignStmt
  | PrintStmt
  | IfStmt
  | WhileStmt
  | Block
  | ExprStmt;

export interface LetStmt {
  kind: "LetStmt";
  name: string;
  value: Expr;
}

export interface AssignStmt {
  kind: "AssignStmt";
  name: string;
  value: Expr;
}

export interface PrintStmt {
  kind: "PrintStmt";
  value: Expr;
}

export interface IfStmt {
  kind: "IfStmt";
  condition: Expr;
  thenBranch: Block;
  elseBranch: Block | null;
}

export interface WhileStmt {
  kind: "WhileStmt";
  condition: Expr;
  body: Block;
}

export interface Block {
  kind: "Block";
  statements: Stmt[];
}

export interface ExprStmt {
  kind: "ExprStmt";
  expr: Expr;
}

export type Expr =
  | BinaryExpr
  | UnaryExpr
  | NumberLiteral
  | BoolLiteral
  | Identifier;

export interface BinaryExpr {
  kind: "BinaryExpr";
  operator: "+" | "-" | "*" | "/" | "==" | "!=" | "<" | ">" | "<=" | ">=";
  left: Expr;
  right: Expr;
}

export interface UnaryExpr {
  kind: "UnaryExpr";
  operator: "-";
  operand: Expr;
}

export interface NumberLiteral {
  kind: "NumberLiteral";
  value: number;
}

export interface BoolLiteral {
  kind: "BoolLiteral";
  value: boolean;
}

export interface Identifier {
  kind: "Identifier";
  name: string;
}

export interface Program {
  kind: "Program";
  statements: Stmt[];
}
