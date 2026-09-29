// Token types for Ouroboros (extended language, docs/phase34plan.md §7.1).

// Plain object + derived union type instead of `enum` — erasableSyntaxOnly
// forbids enum declarations since they emit runtime code; this form
// compiles away entirely while keeping `TokenKind.LET`-style access.
export const TokenKind = {
  // literals & identifiers
  IDENT: "IDENT",
  NUMBER: "NUMBER",
  FLOAT: "FLOAT",     // 3.14 (M1)
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
  NONE: "NONE",
  IN: "IN",
  CLASS: "CLASS",     // M3
  NEW: "NEW",
  SELF: "SELF",
  SUPER: "SUPER",
  ABSTRACT: "ABSTRACT", // M4
  PRIV: "PRIV",

  // operators
  PLUS: "PLUS",
  MINUS: "MINUS",
  STAR: "STAR",
  SLASH: "SLASH",
  PERCENT: "PERCENT", // %
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
  DOT: "DOT",         // member access / method call (M2)
  COLON: "COLON",     // den entries  @{ k: v } (M2)
  AT: "AT",           // opens a scale @( ), den @{ } or clutch @[ ] (M2)

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
  none: TokenKind.NONE,
  in: TokenKind.IN,
  class: TokenKind.CLASS,
  new: TokenKind.NEW,
  self: TokenKind.SELF,
  super: TokenKind.SUPER,
  abstract: TokenKind.ABSTRACT,
  priv: TokenKind.PRIV,
};

export interface Token {
  kind: TokenKind;
  lexeme: string;   // raw source text (STRING: including the quotes)
  value?: string;   // STRING only: the unescaped contents
  line: number;
  col: number;      // starting column of this token
  endCol: number;   // last column (inclusive); tokens never span lines
}
