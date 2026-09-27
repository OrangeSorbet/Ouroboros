// The lexer's DFA as pure data: Q (State), Σ (CharClass), δ (TRANSITIONS
// + delta()), q₀ (START) and F (ACCEPTING, with each state's scanner
// action). This file is the formal automaton — lexer.ts is the
// longest-match driver that runs it, and the lexical view renders these
// tables directly. Real DFAs have no ε-moves, so there are none here:
// "accept and restart at START" is the scanner's action, not an edge.

import { TokenKind } from "./tokens.ts";

// Plain object + derived union type instead of `enum` — erasableSyntaxOnly
// forbids enum declarations since they emit runtime code; this form
// compiles away entirely while keeping `State.START`-style access.
export const State = {
  START: "START",
  IN_WHITESPACE: "IN_WHITESPACE",
  IN_LINE_COMMENT: "IN_LINE_COMMENT",
  IN_IDENT: "IN_IDENT",
  IN_NUMBER: "IN_NUMBER",
  BAD_NUMBER: "BAD_NUMBER",
  SINGLE: "SINGLE",
  SAW_EQ: "SAW_EQ",
  SAW_EQ_EQ: "SAW_EQ_EQ",
  SAW_LT: "SAW_LT",
  SAW_LT_EQ: "SAW_LT_EQ",
  SAW_GT: "SAW_GT",
  SAW_GT_EQ: "SAW_GT_EQ",
  SAW_BANG: "SAW_BANG",
  SAW_BANG_EQ: "SAW_BANG_EQ",
  SAW_AMP: "SAW_AMP",
  SAW_AMP_AMP: "SAW_AMP_AMP",
  SAW_PIPE: "SAW_PIPE",
  SAW_PIPE_PIPE: "SAW_PIPE_PIPE",
  SAW_SLASH: "SAW_SLASH",
  IN_BLOCK_COMMENT: "IN_BLOCK_COMMENT",
  BLOCK_STAR: "BLOCK_STAR",
  BLOCK_END: "BLOCK_END",
  IN_STRING: "IN_STRING",
  STRING_ESC: "STRING_ESC",
  STRING_END: "STRING_END",
  DEAD: "DEAD", // trap: every undefined (state, class) pair lands here
} as const;
export type State = (typeof State)[keyof typeof State];

export const STATES = Object.values(State) as State[];

// Σ: the DFA reads character classes, not raw characters, or δ would need a
// column per Unicode code point. The classes must *partition* the
// characters — every char in a class has to behave identically in every
// state — which is why `n`/`t` get their own class: after a backslash in a
// string they are valid escapes while other letters are not.
export const CharClass = {
  letter: "letter",
  escLetter: "escLetter",
  digit: "digit",
  eq: "eq",
  lt: "lt",
  gt: "gt",
  bang: "bang",
  amp: "amp",
  pipe: "pipe",
  slash: "slash",
  star: "star",
  quote: "quote",
  backslash: "backslash",
  hash: "hash",
  newline: "newline",
  whitespace: "whitespace",
  single: "single",
  other: "other",
} as const;
export type CharClass = (typeof CharClass)[keyof typeof CharClass];

export const CLASSES = Object.values(CharClass) as CharClass[];

// The actual symbol set each class stands for — what edges and table
// headers show (the class name is only an internal bucket).
export const CLASS_LABELS: Record<CharClass, string> = {
  letter: "[a-zA-Z_]∖{n,t}",
  escLetter: "{n,t}",
  digit: "[0-9]",
  eq: "=",
  lt: "<",
  gt: ">",
  bang: "!",
  amp: "&",
  pipe: "|",
  slash: "/",
  star: "*",
  quote: "\"",
  backslash: "\\",
  hash: "#",
  newline: "\\n",
  whitespace: "␠ \\t \\r",
  single: "+ - ( ) { } ; , [ ]",
  other: "other",
};

// One-char tokens reached through SINGLE; the lexeme picks the kind, the
// same way the keyword table refines IN_IDENT. `*` is listed here but has
// its own class because it also closes block comments.
export const SINGLE_KINDS: Record<string, TokenKind> = {
  "+": TokenKind.PLUS,
  "-": TokenKind.MINUS,
  "*": TokenKind.STAR,
  "(": TokenKind.LPAREN,
  ")": TokenKind.RPAREN,
  "{": TokenKind.LBRACE,
  "}": TokenKind.RBRACE,
  ";": TokenKind.SEMI,
  ",": TokenKind.COMMA,
  "[": TokenKind.LBRACKET,
  "]": TokenKind.RBRACKET,
};

// Backslash escapes inside strings: escaped char -> the character it denotes.
export const ESCAPES: Record<string, string> = { n: "\n", t: "\t", "\"": "\"", "\\": "\\" };

export function classify(ch: string): CharClass {
  if (ch === "n" || ch === "t") return "escLetter";
  if (/[a-zA-Z_]/.test(ch)) return "letter";
  if (/[0-9]/.test(ch)) return "digit";
  switch (ch) {
    case "=": return "eq";
    case "<": return "lt";
    case ">": return "gt";
    case "!": return "bang";
    case "&": return "amp";
    case "|": return "pipe";
    case "/": return "slash";
    case "*": return "star";
    case "\"": return "quote";
    case "\\": return "backslash";
    case "#": return "hash";
    case "\n": return "newline";
    case " ": case "\t": case "\r": return "whitespace";
  }
  return ch in SINGLE_KINDS ? "single" : "other";
}

// Every class except the listed ones -> `to` (for "loop on anything but…").
function allBut(to: State, except: CharClass[]): Partial<Record<CharClass, State>> {
  return Object.fromEntries(CLASSES.filter((c) => !except.includes(c)).map((c) => [c, to]));
}

// δ as written: only the entries that lead somewhere other than DEAD.
// delta() below completes it into a total function.
export const TRANSITIONS: Partial<Record<State, Partial<Record<CharClass, State>>>> = {
  [State.START]: {
    whitespace: State.IN_WHITESPACE,
    newline: State.IN_WHITESPACE,
    hash: State.IN_LINE_COMMENT,
    letter: State.IN_IDENT,
    escLetter: State.IN_IDENT,
    digit: State.IN_NUMBER,
    single: State.SINGLE,
    star: State.SINGLE,
    eq: State.SAW_EQ,
    lt: State.SAW_LT,
    gt: State.SAW_GT,
    bang: State.SAW_BANG,
    amp: State.SAW_AMP,
    pipe: State.SAW_PIPE,
    slash: State.SAW_SLASH,
    quote: State.IN_STRING,
  },
  [State.IN_WHITESPACE]: { whitespace: State.IN_WHITESPACE, newline: State.IN_WHITESPACE },
  [State.IN_LINE_COMMENT]: allBut(State.IN_LINE_COMMENT, ["newline"]),
  [State.IN_IDENT]: { letter: State.IN_IDENT, escLetter: State.IN_IDENT, digit: State.IN_IDENT },
  [State.IN_NUMBER]: { digit: State.IN_NUMBER, letter: State.BAD_NUMBER, escLetter: State.BAD_NUMBER },
  [State.BAD_NUMBER]: { letter: State.BAD_NUMBER, escLetter: State.BAD_NUMBER, digit: State.BAD_NUMBER },
  [State.SAW_EQ]: { eq: State.SAW_EQ_EQ },
  [State.SAW_LT]: { eq: State.SAW_LT_EQ },
  [State.SAW_GT]: { eq: State.SAW_GT_EQ },
  [State.SAW_BANG]: { eq: State.SAW_BANG_EQ },
  [State.SAW_AMP]: { amp: State.SAW_AMP_AMP },
  [State.SAW_PIPE]: { pipe: State.SAW_PIPE_PIPE },
  [State.SAW_SLASH]: { star: State.IN_BLOCK_COMMENT },
  [State.IN_BLOCK_COMMENT]: { ...allBut(State.IN_BLOCK_COMMENT, ["star"]), star: State.BLOCK_STAR },
  [State.BLOCK_STAR]: { ...allBut(State.IN_BLOCK_COMMENT, ["star", "slash"]), star: State.BLOCK_STAR, slash: State.BLOCK_END },
  [State.IN_STRING]: { ...allBut(State.IN_STRING, ["quote", "backslash", "newline"]), quote: State.STRING_END, backslash: State.STRING_ESC },
  [State.STRING_ESC]: { escLetter: State.IN_STRING, quote: State.IN_STRING, backslash: State.IN_STRING },
  [State.DEAD]: allBut(State.DEAD, []),
};

// The total transition function: exactly one next state for every
// (state, class) pair — missing entries are the trap state.
export function delta(state: State, cls: CharClass): State {
  return TRANSITIONS[state]?.[cls] ?? State.DEAD;
}

// What the scanner does when a run backs up to an accepting state.
export type AcceptAction =
  | { emit: TokenKind | "byLexeme" | "identOrKeyword" }
  | "discard"
  | { error: string };

// F, with each state's action. SAW_AMP / SAW_PIPE / IN_BLOCK_COMMENT /
// IN_STRING etc. are deliberately absent: a lone `&`, an unclosed comment
// or string is not a token, so a run ending there has nothing to back up to.
export const ACCEPTING: Partial<Record<State, AcceptAction>> = {
  [State.IN_WHITESPACE]: "discard",
  [State.IN_LINE_COMMENT]: "discard",
  [State.IN_IDENT]: { emit: "identOrKeyword" },
  [State.IN_NUMBER]: { emit: TokenKind.NUMBER },
  // Longer than the NUMBER prefix, so longest match prefers it: this is how
  // lexer generators encode "reject this pattern" (a longer error rule wins).
  [State.BAD_NUMBER]: { error: "invalid decimal literal" },
  [State.SINGLE]: { emit: "byLexeme" },
  [State.SAW_EQ]: { emit: TokenKind.ASSIGN },
  [State.SAW_EQ_EQ]: { emit: TokenKind.EQ },
  [State.SAW_LT]: { emit: TokenKind.LT },
  [State.SAW_LT_EQ]: { emit: TokenKind.LTE },
  [State.SAW_GT]: { emit: TokenKind.GT },
  [State.SAW_GT_EQ]: { emit: TokenKind.GTE },
  [State.SAW_BANG]: { emit: TokenKind.NOT },
  [State.SAW_BANG_EQ]: { emit: TokenKind.NEQ },
  [State.SAW_AMP_AMP]: { emit: TokenKind.AND },
  [State.SAW_PIPE_PIPE]: { emit: TokenKind.OR },
  [State.SAW_SLASH]: { emit: TokenKind.SLASH },
  [State.BLOCK_END]: "discard",
  [State.STRING_END]: { emit: TokenKind.STRING },
};
