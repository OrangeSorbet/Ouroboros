import { State } from "./dfa";
import type { DfaStep } from "./lexer";
import type { PdaStep } from "./parser";
import { dfaMessages, pdaPlain, pdaConsumeNote } from "./messages";

export interface Chapter {
  start: number;
  end: number;
  label: string;
}

export function buildChapters(trace: DfaStep[]): Chapter[] {
  const chapters: Chapter[] = [];
  let chapterStart = 0;
  trace.forEach((step, i) => {
    if (step.emitted) {
      chapters.push({
        start: chapterStart,
        end: i,
        label: `${step.emitted.kind} '${step.emitted.lexeme}'`,
      });
      chapterStart = i + 1;
    }
  });
  return chapters;
}

export function describeStep(step: DfaStep): string {
  const lexemeNote = step.lexemeSoFar ? ` Lexeme accumulated so far: "${step.lexemeSoFar}".` : "";

  if (step.to === State.DEAD) {
    return dfaMessages.reject(step.from, step.char || "?");
  }
  if (step.emitted && step.char === "") {
    return dfaMessages.epsilonAccept(step.emitted.kind, step.emitted.lexeme);
  }
  if (step.emitted) {
    return dfaMessages.acceptOnChar(step.char, step.emitted.kind, step.emitted.lexeme);
  }
  if (step.from === State.IN_COMMENT && step.to === State.IN_COMMENT) {
    return dfaMessages.commentSelfLoop(step.char);
  }
  if (step.from === State.START) {
    return dfaMessages.fromStart(step.char, step.to, lexemeNote);
  }
  if (step.from === step.to) {
    return dfaMessages.selfLoop(step.from, step.char, lexemeNote);
  }
  return dfaMessages.transition(step.from, step.char, step.to, lexemeNote);
}

export function describePdaStep(step: PdaStep): string {
  if (step.action === "consume") {
    const note = pdaConsumeNote(step.symbol, step.tokenKind);
    return `Consumed '${step.tokenLexeme || "EOF"}' (inside ${step.symbol}) — ${note}`;
  }

  const entry = pdaPlain[step.symbol];
  const on = step.tokenLexeme ? ` on '${step.tokenLexeme}'` : "";
  if (step.action === "push") {
    const base = entry ? entry.push(step.tokenLexeme) : `PUSH ${step.symbol}`;
    return `${base} (PUSH ${step.symbol}${on})`;
  }

  const returnsTo = step.stackAfter[step.stackAfter.length - 1];
  const base = entry ? entry.pop(returnsTo ?? "(end)") : `POP ${step.symbol}`;
  const tag = returnsTo ? `POP ${step.symbol}${on}, returning control to ${returnsTo}` : `POP ${step.symbol}${on}`;
  return `${base} (${tag})`;
}
