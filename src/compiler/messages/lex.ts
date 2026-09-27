// All prose for Phase 1 (lexical analysis) — kept out of dfa.ts/lexer.ts so
// the automaton and the driver never carry text. Each builder returns the
// four explanation-grid cells for one DfaStep kind, grounded in the ToC
// picture: a total δ with a DEAD trap state, F with per-state actions, and
// a longest-match scanner that restarts the DFA (no ε-moves).

import type { Explanation } from "../trace.ts";
import type { Token } from "../tokens.ts";
import { ACCEPTING, CLASS_LABELS, TRANSITIONS, State } from "../dfa.ts";
import type { AcceptAction, CharClass } from "../dfa.ts";

// Makes invisible tape symbols readable; "" is the end of the input.
export function showChar(ch: string): string {
  if (ch === "") return "EOF";
  if (ch === "\n") return "\\n";
  if (ch === "\t") return "\\t";
  if (ch === "\r") return "\\r";
  if (ch === " ") return "␠";
  return ch;
}

function showLexeme(lexeme: string): string {
  const shown = [...lexeme].map((c) => (c === " " ? " " : showChar(c))).join("");
  return shown.length > 24 ? shown.slice(0, 23) + "…" : shown;
}

const inF = (s: State) => (ACCEPTING[s] ? `${s} ∈ F` : `${s} ∉ F`);

function actionText(action: AcceptAction, lexeme: string): string {
  if (action === "discard") return `discard "${showLexeme(lexeme)}" (no token)`;
  if ("error" in action) return `report the error "${action.error}"`;
  if (action.emit === "identOrKeyword") return `keyword check on "${lexeme}", then emit it`;
  if (action.emit === "byLexeme") return `emit the kind '${lexeme}' names`;
  return `emit ${action.emit} "${showLexeme(lexeme)}"`;
}

const restartNext = (nextChar: string) =>
  nextChar === ""
    ? "Input exhausted — the scanner appends the EOF token."
    : `Restart the DFA at START; the head is already on '${showChar(nextChar)}', which begins the next token.`;

const STOP_NEXT = "Lexing stops with a lexical error; no tokens reach the parser. The partial trace stays playable.";

// Why-cells for particular (from → to) moves, where the generic sentence
// would hide the reason the DFA is shaped that way.
function moveWhy(from: State, to: State, ch: string, lexeme: string): string {
  if (from === State.START)
    return `The character class of '${showChar(ch)}' determines which branch of the DFA is entered — this is the first character of a new token.`;
  if (to === State.BAD_NUMBER && from === State.IN_NUMBER)
    return "Names must start with a letter, so a letter can't continue a NUMBER: the DFA enters the error pattern BAD_NUMBER, which longest match will prefer.";
  if (to === State.IN_BLOCK_COMMENT && from === State.SAW_SLASH)
    return "'/*' opens a block comment. Commit rule: the scanner forgets the SAW_SLASH accept, so EOF before '*/' is an error, not SLASH STAR.";
  if (to === State.IN_BLOCK_COMMENT && from === State.BLOCK_STAR)
    return "A '*' not followed by '/' doesn't close the comment, so the DFA falls back to IN_BLOCK_COMMENT.";
  if (to === State.BLOCK_STAR && from === State.IN_BLOCK_COMMENT)
    return "A '*' might begin the closing '*/'; BLOCK_STAR is the DFA's one-char memory of it (a DFA's only memory is its state).";
  if (to === State.BLOCK_END) return "'*/' closes the comment; BLOCK_END ∈ F with action discard.";
  if (to === State.STRING_ESC) return "A backslash escapes the next char; only n, t, \" and \\ lead back to IN_STRING — every other class goes to DEAD.";
  if (from === State.STRING_ESC) return "The escape sequence is complete; the DFA is back inside the string body.";
  if (to === State.STRING_END) return "The closing quote ends the string; STRING_END ∈ F.";
  if (to.endsWith("_EQ") || to === State.SAW_AMP_AMP || to === State.SAW_PIPE_PIPE)
    return `A two-char operator gets its own accepting state, so longest match prefers "${lexeme}" over the one-char prefix.`;
  if (from === to) {
    if (from === State.IN_LINE_COMMENT)
      return "Comments are consumed character-by-character until a newline is reached and never produce a token.";
    if (from === State.BAD_NUMBER)
      return "Still inside the bad literal: longest match keeps extending the error pattern so the whole literal is reported.";
    return "The character extends the current lexeme without changing state — the DFA keeps consuming while the run of matching characters continues.";
  }
  return "A state transition occurs on this character, moving the DFA one step closer to an accepting configuration.";
}

export function explainMove(from: State, to: State, ch: string, cls: CharClass, lexeme: string): Explanation {
  const loop = from === to ? " (self-loop)" : "";
  const outgoing = TRANSITIONS[to];
  return {
    what: `Read '${showChar(ch)}' (${CLASS_LABELS[cls]}): δ(${from}, '${showChar(ch)}') = ${to}${loop}. Lexeme so far "${showLexeme(lexeme)}".`,
    why: moveWhy(from, to, ch, lexeme),
    formal: `δ(${from}, ${cls}) = ${to}, ${inF(to)}`,
    next: !ACCEPTING[to]
      ? `${to} ∉ F — keep reading; the token isn't complete yet.`
      : outgoing
        ? `${to} ∈ F — record it as the last accept, then try to extend the match (longest match).`
        : `${to} ∈ F and has no moves out, so the next char must stop the run.`,
  };
}

// The run stopped on a char with no move while an accepting state was seen.
export function explainNoMove(from: State, ch: string, cls: CharClass, accept: State, lexeme: string): Explanation {
  const c = showChar(ch);
  return {
    what: `δ(${from}, '${c}') is only DEAD — no real move, so the run stops; the head stays on '${c}' (not consumed).`,
    why: `Longest match: "${showLexeme(lexeme)}" is the longest prefix the DFA accepts; '${c}' can't extend it, so it will start the next token.`,
    formal: `δ(${from}, ${cls}) = DEAD ⇒ back up to last accept ${accept} ∈ F`,
    next: `Perform ${accept}'s action: ${actionText(ACCEPTING[accept]!, lexeme)}.`,
  };
}

export function explainKeywordCheck(lexeme: string, kind: string): Explanation {
  const isKeyword = kind !== "IDENT";
  return {
    what: `IN_IDENT accepted "${lexeme}"; look it up in the keyword table → ${isKeyword ? `keyword ${kind}` : "not reserved, IDENT"}.`,
    why: "One DFA branch per keyword would add ~30 states; IN_IDENT accepts every name and a table lookup picks out reserved words — same language.",
    formal: isKeyword ? `KEYWORDS["${lexeme}"] = ${kind}` : `"${lexeme}" ∉ KEYWORDS ⇒ IDENT`,
    next: `Emit ${kind} "${lexeme}" and restart at START.`,
  };
}

export function explainEmit(state: State, token: Token, nextChar: string): Explanation {
  const byLexeme = state === State.SINGLE;
  const value = token.value !== undefined ? ` (value "${showLexeme(token.value)}")` : "";
  return {
    what: `Accept in ${state}: emit ${token.kind} "${showLexeme(token.lexeme)}"${value} at ${token.line}:${token.col}–${token.endCol}.`,
    why: byLexeme
      ? "SINGLE groups every one-char symbol into one accepting state; the lexeme picks the kind, the same trick as the keyword table."
      : state === State.STRING_END
        ? "STRING_END ∈ F; the token keeps its raw lexeme plus the unescaped value (escapes like \\n resolved here, not by δ)."
        : `${state} ∈ F, so the scanner runs its action. Restarting is the scanner's job, not an edge — a DFA has no ε-moves.`,
    formal: byLexeme
      ? `action(SINGLE) = emit by lexeme: '${token.lexeme}' ↦ ${token.kind}`
      : `${state} ∈ F, action(${state}) = emit ${token.kind}`,
    next: restartNext(nextChar),
  };
}

export function explainDiscard(state: State, lexeme: string, nextChar: string): Explanation {
  const what = state === State.IN_WHITESPACE ? "whitespace" : "comment";
  return {
    what: `Accept in ${state}: discard the ${what} "${showLexeme(lexeme)}" — no token is emitted.`,
    why: "Whitespace and comments are matched like any token, so every char belongs to some run, but their action is discard: the parser never sees them.",
    formal: `${state} ∈ F, action(${state}) = discard`,
    next: restartNext(nextChar),
  };
}

// An accepting state whose action is an error (BAD_NUMBER).
export function explainActionError(state: State, lexeme: string, message: string): Explanation {
  return {
    what: `${state} accepted "${showLexeme(lexeme)}"; its action is a lexical error: ${message}.`,
    why: "Names must start with a letter: the first char fixes the token class, so a digit-first run is a number, and numbers allow only digits.",
    formal: `${state} ∈ F, action(${state}) = error("${message}")`,
    next: "Lexing stops (Python reports the same SyntaxError). The partial trace stays playable.",
  };
}

// The language's diagnostic for a run that died with no accepting prefix.
export function lexErrorMessage(state: State, ch: string): string {
  switch (state) {
    case State.START: return `unexpected character '${showChar(ch)}'`;
    case State.SAW_AMP: return "lone '&' (did you mean '&&'?)";
    case State.SAW_PIPE: return "lone '|' (did you mean '||'?)";
    case State.IN_BLOCK_COMMENT:
    case State.BLOCK_STAR: return "unterminated comment";
    case State.STRING_ESC: if (ch !== "" && ch !== "\n") return `invalid escape '\\${ch}'`;
  }
  return ch === "\n" ? "unterminated string (newline before closing quote)" : "unterminated string";
}

function deadRunWhy(state: State): string {
  switch (state) {
    case State.START: return "This char begins no pattern of the language, so the run is trapped before reaching any accepting state — nothing can be emitted.";
    case State.SAW_AMP:
    case State.SAW_PIPE: return "Snek has '&&' and '||' but no one-char '&' or '|' token, so this state ∉ F: there is no accepting prefix to back up to.";
    case State.IN_BLOCK_COMMENT:
    case State.BLOCK_STAR: return "Commit rule: after '/*' the scanner never backs up to SAW_SLASH, else '/* x' would silently re-lex as SLASH STAR IDENT.";
    case State.STRING_ESC: return "Only \\n \\t \\\" \\\\ are escapes: δ(STRING_ESC, c) is defined just for those classes; STRING_ESC ∉ F.";
  }
  return "A string only ends at its closing quote (STRING_END ∈ F); IN_STRING ∉ F, and δ(IN_STRING, \\n) = DEAD since strings can't span lines.";
}

// The run died (δ went to DEAD, or input ended) with no accepting state seen.
export function explainDeadRun(state: State, ch: string, cls: CharClass | undefined, message: string): Explanation {
  const atEof = ch === "";
  return {
    what: atEof
      ? `Input ended in ${state}, which is not accepting: ${message}.`
      : `δ(${state}, '${showChar(ch)}') = DEAD: the run is trapped with no accepted prefix — ${message}.`,
    why: deadRunWhy(state),
    formal: atEof
      ? `run ends in ${state} ∉ F, no accept since the token began ⇒ reject`
      : `δ(${state}, ${cls}) = DEAD, DEAD loops on all Σ, no accept seen ⇒ reject`,
    next: STOP_NEXT,
  };
}

export function explainEof(line: number, col: number, tokenCount: number): Explanation {
  return {
    what: `End of input at ${line}:${col}: append the EOF token.`,
    why: "EOF is not a character on the tape — it's the end marker ($) the parser needs to know the token stream is complete.",
    formal: `tokens = t₁ … t${tokenCount - 1} · EOF ($)`,
    next: `Phase 1 done: ${tokenCount} tokens (incl. EOF) go to the parser in Phase 2.`,
  };
}

// Scrubber chapter label for one scanner run (one per token or discarded chunk).
export function chapterLabel(state: State, token?: Token): string {
  if (token?.kind === "EOF") return "EOF";
  if (token) return token.kind === "IDENT" || token.kind === "NUMBER" || token.kind === "STRING"
    ? `${token.kind} ${showLexeme(token.lexeme)}`
    : token.lexeme;
  if (state === State.IN_WHITESPACE) return "whitespace";
  if (ACCEPTING[state] === "discard") return "comment";
  return "error";
}
