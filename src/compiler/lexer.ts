import type { Token } from "./tokens";
import { TokenKind, KEYWORDS } from "./tokens";
import { State, TRANSITIONS, SINGLE_CHAR_TOKENS, classify } from "./dfa";

export interface DfaStep {
  char: string;
  from: State;
  to: State;
  line: number;
  col: number;
  lexemeSoFar?: string;
  emitted?: { kind: TokenKind; lexeme: string };
}

export interface LexResult {
  tokens: Token[];
  trace: DfaStep[];
}

export class LexError extends Error {
  line: number;
  col: number;
  partialTrace: DfaStep[];
  constructor(line: number, col: number, char: string, partialTrace: DfaStep[] = []) {
    super(`Unexpected character '${char}' at ${line}:${col}`);
    this.line = line;
    this.col = col;
    this.partialTrace = partialTrace;
  }
}

export function lex(source: string): LexResult {
  const tokens: Token[] = [];
  const trace: DfaStep[] = [];

  let i = 0;
  let line = 1;
  let col = 1;

  const peek = (offset = 0) => source[i + offset] ?? "\0";
  const advanceCursor = (ch: string) => {
    i++;
    if (ch === "\n") { line++; col = 1; } else { col++; }
  };

  while (i < source.length) {
    const startLine = line;
    const startCol = col;
    const ch = peek();
    const cls = classify(ch);

    if (cls === "whitespace" || cls === "newline") {
      advanceCursor(ch);
      continue;
    }

    let state: State = State.START;

    if (cls === "hash") {
      trace.push({ char: ch, from: State.START, to: State.IN_COMMENT, line, col });
      advanceCursor(ch);
      while (i < source.length && peek() !== "\n") {
        trace.push({ char: peek(), from: State.IN_COMMENT, to: State.IN_COMMENT, line, col });
        advanceCursor(peek());
      }
      continue;
    }

    if (cls === "single") {
      const kind = SINGLE_CHAR_TOKENS[ch];
      trace.push({ char: ch, from: State.START, to: State.START, line, col, emitted: { kind, lexeme: ch } });
      tokens.push({ kind, lexeme: ch, line: startLine, col: startCol });
      advanceCursor(ch);
      continue;
    }

    if (cls === "eq" || cls === "lt" || cls === "gt" || cls === "bang") {
      const next = TRANSITIONS[State.START]![cls]!;
      trace.push({ char: ch, from: State.START, to: next, line, col, lexemeSoFar: ch });
      advanceCursor(ch);
      state = next;

      if (peek() === "=") {
        const eqChar = peek();
        advanceCursor(eqChar);
        const kind =
          state === State.SAW_EQ ? TokenKind.EQ :
          state === State.SAW_LT ? TokenKind.LTE :
          state === State.SAW_GT ? TokenKind.GTE :
          TokenKind.NEQ;
        const lexeme = ch + eqChar;
        trace.push({ char: eqChar, from: state, to: State.START, line, col, lexemeSoFar: lexeme, emitted: { kind, lexeme } });
        tokens.push({ kind, lexeme, line: startLine, col: startCol });
        continue;
      }

      if (state === State.SAW_BANG) {
        trace.push({ char: "", from: state, to: State.DEAD, line: startLine, col: startCol, lexemeSoFar: ch });
        throw new LexError(startLine, startCol, ch, trace);
      }

      const kind = state === State.SAW_EQ ? TokenKind.ASSIGN
        : state === State.SAW_LT ? TokenKind.LT
        : TokenKind.GT;
      trace.push({ char: "", from: state, to: State.START, line, col, lexemeSoFar: ch, emitted: { kind, lexeme: ch } });
      tokens.push({ kind, lexeme: ch, line: startLine, col: startCol });
      continue;
    }

    if (cls === "letter" || cls === "digit") {
      let lexeme = "";
      state = cls === "letter" ? State.IN_IDENT : State.IN_NUMBER;
      trace.push({ char: ch, from: State.START, to: state, line, col, lexemeSoFar: ch });
      lexeme += ch;
      advanceCursor(ch);

      while (i < source.length) {
        const c = peek();
        const ccls = classify(c);
        const nextState: State | undefined = TRANSITIONS[state]?.[ccls];
        if (!nextState) break;
        lexeme += c;
        trace.push({ char: c, from: state, to: nextState, line, col, lexemeSoFar: lexeme });
        state = nextState;
        advanceCursor(c);
      }

      const kind = state === State.IN_IDENT ? (KEYWORDS[lexeme] ?? TokenKind.IDENT) : TokenKind.NUMBER;
      trace.push({ char: "", from: state, to: State.START, line, col, lexemeSoFar: lexeme, emitted: { kind, lexeme } });
      tokens.push({ kind, lexeme, line: startLine, col: startCol });
      continue;
    }

    throw new LexError(startLine, startCol, ch, trace);
  }

  tokens.push({ kind: TokenKind.EOF, lexeme: "", line, col });
  return { tokens, trace };
}
