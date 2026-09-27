// Token types for Snek — one entry per accepting state of the lexer DFA.

// Plain object + derived union type instead of `enum` — erasableSyntaxOnly
// forbids enum declarations since they emit runtime code; this form
// compiles away entirely while keeping `TokenKind.LET`-style access.
export const TokenKind = {
  // literals & identifiers
  IDENT: "IDENT",
  NUMBER: "NUMBER",

  // keywords
  LET: "LET",
  PRINT: "PRINT",
  IF: "IF",
  ELSE: "ELSE",
  WHILE: "WHILE",
  TRUE: "TRUE",
  FALSE: "FALSE",

  // operators
  PLUS: "PLUS",
  MINUS: "MINUS",
  STAR: "STAR",
  SLASH: "SLASH",
  ASSIGN: "ASSIGN",       // =
  EQ: "EQ",               // ==
  NEQ: "NEQ",              // !=
  LT: "LT",
  GT: "GT",
  LTE: "LTE",
  GTE: "GTE",

  // punctuation
  LPAREN: "LPAREN",
  RPAREN: "RPAREN",
  LBRACE: "LBRACE",
  RBRACE: "RBRACE",
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
  true: TokenKind.TRUE,
  false: TokenKind.FALSE,
};

export interface Token {
  kind: TokenKind;
  lexeme: string;   // raw source text
  line: number;
  col: number;      // starting column of this token
}
