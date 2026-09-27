// Token types for Snek (extended language, docs/phase34plan.md §7.1).

// Plain object + derived union type instead of `enum` — erasableSyntaxOnly
// forbids enum declarations since they emit runtime code; this form
// compiles away entirely while keeping `TokenKind.LET`-style access.
export const TokenKind = {
  // literals & identifiers
  IDENT: "IDENT",
  NUMBER: "NUMBER",
  STRING: "STRING",

  // keywords
  LET: "LET",
  PRINT: "PRINT",
  IF: "IF",
  ELSE: "ELSE",
  WHILE: "WHILE",
  FOR: "FOR",
  FN: "FN",
  RETURN: "RETURN",
  TRUE: "TRUE",
  FALSE: "FALSE",

  // operators
  PLUS: "PLUS",
  MINUS: "MINUS",
  STAR: "STAR",
  SLASH: "SLASH",
  ASSIGN: "ASSIGN",   // =
  EQ: "EQ",           // ==
  NEQ: "NEQ",         // !=
  LT: "LT",
  GT: "GT",
  LTE: "LTE",
  GTE: "GTE",
  AND: "AND",         // &&
  OR: "OR",           // ||
  NOT: "NOT",         // !

  // punctuation
  LPAREN: "LPAREN",
  RPAREN: "RPAREN",
  LBRACE: "LBRACE",
  RBRACE: "RBRACE",
  LBRACKET: "LBRACKET",
  RBRACKET: "RBRACKET",
  COMMA: "COMMA",
  SEMI: "SEMI",

  EOF: "EOF",
} as const;
export type TokenKind = (typeof TokenKind)[keyof typeof TokenKind];

export const KEYWORDS: Record<string, TokenKind> = {
  let: TokenKind.LET,
  print: TokenKind.PRINT,
  if: TokenKind.IF,
  else: TokenKind.ELSE,
  while: TokenKind.WHILE,
  for: TokenKind.FOR,
  fn: TokenKind.FN,
  return: TokenKind.RETURN,
  true: TokenKind.TRUE,
  false: TokenKind.FALSE,
};

export interface Token {
  kind: TokenKind;
  lexeme: string;   // raw source text (STRING: including the quotes)
  value?: string;   // STRING only: the unescaped contents
  line: number;
  col: number;      // starting column of this token
  endCol: number;   // last column (inclusive); tokens never span lines
}
