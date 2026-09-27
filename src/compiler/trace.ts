// Shared shapes every compiler phase's trace uses, so the UI can play back
// any phase generically: the scrubber walks `trace`, the 2×2 explanation
// grid reads `trace[i].explain`, the code panel highlights `trace[i].span`.
// Compiler modules import with explicit `.ts` extensions so scripts/check-*.ts
// can run them under plain `node` (type stripping) without a bundler.

export type PhaseId = "lex" | "parse" | "semantic" | "ir" | "opt" | "bytecode" | "vm";

// 1-based line/col, inclusive endCol. Multi-line nodes: the UI highlights
// only [col, endCol] on `line` when endLine === line, otherwise from col to
// end of `line`.
export interface Span {
  line: number;
  col: number;
  endLine: number;
  endCol: number;
}

// The four cells of the explanation grid. Every step fills all four — an
// empty "why" is a bug (docs/phase34plan.md §6).
export interface Explanation {
  what: string;   // what happened in this step
  why: string;    // why, in ToC terms (the rule/automaton forcing it)
  formal: string; // formal notation: δ entry, production, typing rule, translation rule…
  next: string;   // what the machine does next
}

export interface TraceStep {
  explain: Explanation;
  span?: Span; // source location this step concerns (phases 1–4); optional later
}

export interface Chapter {
  start: number; // first trace index (inclusive)
  end: number;   // last trace index (inclusive)
  label: string;
}

export interface PhaseError {
  message: string;
  span?: Span;
}

// A phase never throws: on error it returns ok=false, the partial trace up
// to and including the error step (explain filled), and `error`.
export interface PhaseResult<TStep extends TraceStep, TOutput> {
  ok: boolean;
  trace: TStep[];
  chapters: Chapter[];
  error?: PhaseError;
  output?: TOutput; // present iff ok
}
