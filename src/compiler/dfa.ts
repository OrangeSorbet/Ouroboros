// The lexer's DFA: states, the transition function (delta), and which
// states are accepting (and for which token kind). This file is the
// formal automaton — lexer.ts just drives it character by character.
// Keeping it separate is what lets Phase 3 render this table directly
// as a React Flow graph without touching scanning logic.

import { TokenKind } from "./tokens";

// Plain object + derived union type instead of `enum` — erasableSyntaxOnly
// forbids enum declarations since they emit runtime code; this form
// compiles away entirely while keeping `State.START`-style access.
export const State = {
  START: "START",
  IN_IDENT: "IN_IDENT",
  IN_NUMBER: "IN_NUMBER",
  IN_COMMENT: "IN_COMMENT",
  SAW_EQ: "SAW_EQ",     // just consumed '='
  SAW_LT: "SAW_LT",     // just consumed '<'
  SAW_GT: "SAW_GT",     // just consumed '>'
  SAW_BANG: "SAW_BANG", // just consumed '!'
  DEAD: "DEAD",         // no valid transition — lexical error
} as const;
export type State = (typeof State)[keyof typeof State];

// Single-character states are accepting immediately and don't need a
// dedicated State entry — they're handled as one-shot transitions in
// SINGLE_CHAR_TOKENS below (this keeps the state set from exploding).
export const SINGLE_CHAR_TOKENS: Record<string, TokenKind> = {
  "+": TokenKind.PLUS,
  "-": TokenKind.MINUS,
  "*": TokenKind.STAR,
  "/": TokenKind.SLASH,
  "(": TokenKind.LPAREN,
  ")": TokenKind.RPAREN,
  "{": TokenKind.LBRACE,
  "}": TokenKind.RBRACE,
  ";": TokenKind.SEMI,
};

// Character classification — the DFA's effective input alphabet is
// these classes, not raw characters, or the table would be enormous.
// "epsilon" and "reject" are pseudo-classes: classify() never returns
// them, but they label the two kinds of edges every accepting/dead state
// needs to keep this a *closed* automaton (every state has a way out):
// "epsilon" = token accepted, no input consumed, restart at START;
// "reject" = no valid continuation, fall into the DEAD trap state.
export type CharClass =
  | "letter"
  | "digit"
  | "eq"
  | "lt"
  | "gt"
  | "bang"
  | "hash"
  | "newline"
  | "whitespace"
  | "single"
  | "other"
  | "epsilon"
  | "reject";

// Human-readable alphabet labels for graph/table edges — the raw class
// name ("letter") is an internal bucket, not the actual input symbol set.
export const CLASS_LABELS: Record<CharClass, string> = {
  letter: "[a-zA-Z_]",
  digit: "[0-9]",
  eq: "'='",
  lt: "'<'",
  gt: "'>'",
  bang: "'!'",
  hash: "'#'",
  newline: "'\\n'",
  whitespace: "' '",
  single: "single-char",
  other: "other",
  epsilon: "ε (accept)",
  reject: "ε (reject)",
};

export function classify(ch: string): CharClass {
  if (/[a-zA-Z_]/.test(ch)) return "letter";
  if (/[0-9]/.test(ch)) return "digit";
  if (ch === "=") return "eq";
  if (ch === "<") return "lt";
  if (ch === ">") return "gt";
  if (ch === "!") return "bang";
  if (ch === "#") return "hash";
  if (ch === "\n") return "newline";
  if (ch === " " || ch === "\t" || ch === "\r") return "whitespace";
  if (ch in SINGLE_CHAR_TOKENS) return "single";
  return "other";
}

// delta: (state, charClass) -> next state.
// Real character-consuming entries continue a multi-char token; "epsilon"
// entries are the accept-and-restart edge every accepting state needs
// back to START, and "reject" is the trap edge into DEAD. Without these,
// IN_IDENT/SAW_EQ/etc. would be dead ends with no outgoing edge — not a
// real DFA. Single chars/whitespace/punctuation still resolve directly
// in the scan loop (their "edge" is the START self-loop, drawn separately).
export const TRANSITIONS: Partial<Record<State, Partial<Record<CharClass, State>>>> = {
  [State.START]: {
    letter: State.IN_IDENT,
    digit: State.IN_NUMBER,
    hash: State.IN_COMMENT,
    eq: State.SAW_EQ,
    lt: State.SAW_LT,
    gt: State.SAW_GT,
    bang: State.SAW_BANG,
  },
  [State.IN_IDENT]: {
    letter: State.IN_IDENT,
    digit: State.IN_IDENT,
    epsilon: State.START,
  },
  [State.IN_NUMBER]: {
    digit: State.IN_NUMBER,
    epsilon: State.START,
  },
  [State.IN_COMMENT]: {
    // stays in IN_COMMENT for everything except newline (handled in loop)
  },
  [State.SAW_EQ]: {
    eq: State.START,     // consumes the 2nd '=' -> "==" accepted, restart
    epsilon: State.START, // no '=' follows -> "=" accepted as ASSIGN, restart
  },
  [State.SAW_LT]: {
    eq: State.START,     // "<="
    epsilon: State.START, // "<"
  },
  [State.SAW_GT]: {
    eq: State.START,     // ">="
    epsilon: State.START, // ">"
  },
  [State.SAW_BANG]: {
    eq: State.START,      // "!="
    reject: State.DEAD,   // bare '!' has no valid token -> trap
  },
};

// Accepting states that resolve to a fixed token kind (multi-char, not
// counting IN_IDENT/IN_NUMBER which need the lexeme itself to resolve).
// SAW_EQ/SAW_LT/SAW_GT are accepting too — their epsilon edge emits a
// token (ASSIGN/LT/GT, or EQ/LTE/GTE if a trailing '=' was also consumed)
// exactly like IN_IDENT/IN_NUMBER do. Listed here so the graph draws them
// double-circled; the mapped kind is just the bare (no trailing '=') case,
// since this map only records that the state accepts, not every kind it
// can resolve to.
export const ACCEPTING: Partial<Record<State, TokenKind>> = {
  [State.IN_IDENT]: TokenKind.IDENT,       // may be overridden by keyword lookup
  [State.IN_NUMBER]: TokenKind.NUMBER,
  [State.SAW_EQ]: TokenKind.ASSIGN,
  [State.SAW_LT]: TokenKind.LT,
  [State.SAW_GT]: TokenKind.GT,
};
