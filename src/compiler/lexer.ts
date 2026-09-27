// The scanner: a textbook longest-match driver around the DFA in dfa.ts.
// Run δ from START, remembering the last accepting state and where it was
// reached; stop when the next move is DEAD (the char is NOT consumed — it
// begins the next token) or the input ends; back up to the last accept,
// perform its action, restart at START. Every δ move, stop, action and the
// final EOF becomes one DfaStep so the UI can replay the tape.

import type { Chapter, PhaseResult, Span, TraceStep } from "./trace.ts";
import type { Token } from "./tokens.ts";
import { KEYWORDS, TokenKind } from "./tokens.ts";
import { ACCEPTING, ESCAPES, SINGLE_KINDS, State, classify, delta } from "./dfa.ts";
import type { CharClass } from "./dfa.ts";
import {
  chapterLabel, explainActionError, explainDeadRun, explainDiscard, explainEmit,
  explainEof, explainKeywordCheck, explainMove, explainNoMove, lexErrorMessage,
} from "./messages/lex.ts";

export type DfaStepKind = "move" | "no-move" | "accept-emit" | "accept-discard" | "keyword-check" | "error" | "eof";

export interface DfaStep extends TraceStep {
  kind: DfaStepKind;
  from: State;
  to: State;          // no-move / dying error: DEAD; accept: START (the restart)
  char: string;       // the char read or refused; "" = end of input
  cls?: CharClass;    // class of `char` (absent at end of input / for actions)
  offset: number;     // source index of the head: the char read, or the lookahead
  line: number;       // position of `offset`
  col: number;
  start: number;      // source index where the current lexeme began
  lexemeSoFar: string;
  token?: Token;      // accept-emit / eof
}

export function lex(source: string): PhaseResult<DfaStep, Token[]> {
  const n = source.length;
  // line/col of every source index, plus index n (just past the end).
  const lineAt: number[] = [];
  const colAt: number[] = [];
  for (let i = 0, line = 1, col = 1; i <= n; i++) {
    lineAt.push(line);
    colAt.push(col);
    if (source[i] === "\n") { line++; col = 1; } else col++;
  }
  const span = (a: number, b: number): Span => ({ line: lineAt[a], col: colAt[a], endLine: lineAt[b], endCol: colAt[b] });

  const tokens: Token[] = [];
  const trace: DfaStep[] = [];
  const chapters: Chapter[] = [];
  const push = (s: Omit<DfaStep, "line" | "col">) => trace.push({ ...s, line: lineAt[s.offset], col: colAt[s.offset] });

  let pos = 0;
  while (pos < n) {
    const chapterStart = trace.length;
    let state: State = State.START;
    let i = pos;
    let last: { state: State; end: number } | null = null;

    while (i < n) {
      const ch = source[i];
      const cls = classify(ch);
      const next = delta(state, cls);
      if (next === State.DEAD) {
        // With an accepted prefix this is just the end of the token; without
        // one the run dies, which the error step below records.
        if (last) {
          push({
            kind: "no-move", from: state, to: State.DEAD, char: ch, cls, offset: i, start: pos,
            lexemeSoFar: source.slice(pos, i), span: span(i, i),
            explain: explainNoMove(state, ch, cls, last.state, source.slice(pos, last.end)),
          });
        }
        break;
      }
      push({
        kind: "move", from: state, to: next, char: ch, cls, offset: i, start: pos,
        lexemeSoFar: source.slice(pos, i + 1), span: span(i, i),
        explain: explainMove(state, next, ch, cls, source.slice(pos, i + 1)),
      });
      state = next;
      i++;
      // Commit rule: once inside a block comment, never back up to the
      // SAW_SLASH accept — an unclosed comment is an error, not SLASH STAR.
      if (state === State.IN_BLOCK_COMMENT) last = null;
      if (ACCEPTING[state]) last = { state, end: i };
    }

    if (!last) {
      const ch = source[i] ?? "";
      const cls = i < n ? classify(ch) : undefined;
      const message = lexErrorMessage(state, ch);
      const errSpan = state === State.START ? span(i, i) : span(pos, Math.min(i, n - 1));
      push({
        kind: "error", from: state, to: i < n ? State.DEAD : state, char: ch, cls, offset: i, start: pos,
        lexemeSoFar: source.slice(pos, i), span: errSpan,
        explain: explainDeadRun(state, ch, cls, message),
      });
      chapters.push({ start: chapterStart, end: trace.length - 1, label: chapterLabel(state) });
      return { ok: false, trace, chapters, error: { message, span: errSpan } };
    }

    // Back up to the last accept (the head returns to last.end) and act.
    const lexeme = source.slice(pos, last.end);
    const action = ACCEPTING[last.state]!;
    const nextChar = source[last.end] ?? "";
    const tokSpan = span(pos, last.end - 1);
    const base = { from: last.state, char: nextChar, offset: last.end, start: pos, lexemeSoFar: lexeme, span: tokSpan };
    let token: Token | undefined;

    if (action === "discard") {
      push({ ...base, kind: "accept-discard", to: State.START, explain: explainDiscard(last.state, lexeme, nextChar) });
    } else if ("error" in action) {
      push({ ...base, kind: "error", to: last.state, explain: explainActionError(last.state, lexeme, action.error) });
      chapters.push({ start: chapterStart, end: trace.length - 1, label: chapterLabel(last.state) });
      return { ok: false, trace, chapters, error: { message: `${action.error} "${lexeme}"`, span: tokSpan } };
    } else {
      let kind: TokenKind;
      if (action.emit === "identOrKeyword") {
        kind = KEYWORDS[lexeme] ?? TokenKind.IDENT;
        push({ ...base, kind: "keyword-check", to: last.state, explain: explainKeywordCheck(lexeme, kind) });
      } else {
        kind = action.emit === "byLexeme" ? SINGLE_KINDS[lexeme] : action.emit;
      }
      token = { kind, lexeme, line: tokSpan.line, col: tokSpan.col, endCol: tokSpan.endCol };
      if (kind === TokenKind.STRING) token.value = lexeme.slice(1, -1).replace(/\\(.)/g, (_, c: string) => ESCAPES[c]);
      tokens.push(token);
      push({ ...base, kind: "accept-emit", to: State.START, token, explain: explainEmit(last.state, token, nextChar) });
    }
    chapters.push({ start: chapterStart, end: trace.length - 1, label: chapterLabel(last.state, token) });
    pos = last.end;
  }

  const eof: Token = { kind: TokenKind.EOF, lexeme: "", line: lineAt[n], col: colAt[n], endCol: colAt[n] };
  tokens.push(eof);
  push({
    kind: "eof", from: State.START, to: State.START, char: "", offset: n, start: n, lexemeSoFar: "",
    token: eof, span: span(n, n), explain: explainEof(eof.line, eof.col, tokens.length),
  });
  chapters.push({ start: trace.length - 1, end: trace.length - 1, label: chapterLabel(State.START, eof) });
  return { ok: true, trace, chapters, output: tokens };
}
