// FIRST, FOLLOW and the LL(1) parse table M, computed from grammar.ts by
// the textbook fixpoint iterations (Dragon book §4.4). The table is what
// makes the PDA deterministic: for a non-terminal A on top of the stack and
// lookahead t, M[A, t] names the one production to expand — or nothing, which
// is a syntax error. A grammar is LL(1) iff no cell ever needs two entries.
import { PRODUCTIONS, NON_TERMINALS, isNonTerminal } from "./grammar.ts";

export const NULLABLE = new Set<string>();
export const FIRST: Record<string, Set<string>> = {};
export const FOLLOW: Record<string, Set<string>> = {};
for (const nt of NON_TERMINALS) {
  FIRST[nt] = new Set();
  FOLLOW[nt] = new Set();
}

// FIRST of a symbol string α, plus whether α ⇒* ε.
export function firstOfSeq(seq: string[]): { first: Set<string>; nullable: boolean } {
  const first = new Set<string>();
  for (const s of seq) {
    if (!isNonTerminal(s)) {
      first.add(s);
      return { first, nullable: false };
    }
    for (const t of FIRST[s]) first.add(t);
    if (!NULLABLE.has(s)) return { first, nullable: false };
  }
  return { first, nullable: true };
}

// FIRST and NULLABLE together: grow until nothing changes.
for (let changed = true; changed; ) {
  changed = false;
  for (const p of PRODUCTIONS) {
    const { first, nullable } = firstOfSeq(p.rhs);
    const before = FIRST[p.lhs].size;
    for (const t of first) FIRST[p.lhs].add(t);
    if (FIRST[p.lhs].size !== before) changed = true;
    if (nullable && !NULLABLE.has(p.lhs)) {
      NULLABLE.add(p.lhs);
      changed = true;
    }
  }
}

// FOLLOW: for A → α B β, FIRST(β) ⊆ FOLLOW(B), and FOLLOW(A) ⊆ FOLLOW(B) when
// β ⇒* ε. The start symbol gets no `$`: Program → DeclList EOF already ends
// with the EOF terminal, which plays the role of the textbook end-marker.
for (let changed = true; changed; ) {
  changed = false;
  for (const p of PRODUCTIONS) {
    p.rhs.forEach((b, i) => {
      if (!isNonTerminal(b)) return;
      const { first, nullable } = firstOfSeq(p.rhs.slice(i + 1));
      const before = FOLLOW[b].size;
      for (const t of first) FOLLOW[b].add(t);
      if (nullable) for (const t of FOLLOW[p.lhs]) FOLLOW[b].add(t);
      if (FOLLOW[b].size !== before) changed = true;
    });
  }
}

// M[A][t] = production id. A → α goes in M[A, t] for every t ∈ FIRST(α),
// and, when α ⇒* ε, for every t ∈ FOLLOW(A).
export const TABLE: Record<string, Partial<Record<string, number>>> = {};
export interface Conflict {
  nonTerminal: string;
  terminal: string;
  productions: number[];
}
export const CONFLICTS: Conflict[] = [];
for (const nt of NON_TERMINALS) TABLE[nt] = {};
for (const p of PRODUCTIONS) {
  const { first, nullable } = firstOfSeq(p.rhs);
  const cols = new Set(first);
  if (nullable) for (const t of FOLLOW[p.lhs]) cols.add(t);
  for (const t of cols) {
    const existing = TABLE[p.lhs][t];
    if (existing !== undefined && existing !== p.id) {
      CONFLICTS.push({ nonTerminal: p.lhs, terminal: t, productions: [existing, p.id] });
    } else {
      TABLE[p.lhs][t] = p.id;
    }
  }
}

// The expected set reported on a syntax error: the non-empty columns of A's row.
export const expectedFor = (nt: string): string[] => Object.keys(TABLE[nt]);
