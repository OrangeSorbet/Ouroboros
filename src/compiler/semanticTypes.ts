// Output contract of Semantic Analysis (phase 3), consumed by IR generation
// (phase 4). Rules: docs/phase34plan.md §7.5 and §10.

export type SnekType =
  | { kind: "int" }
  | { kind: "bool" }
  | { kind: "string" }
  | { kind: "array"; element: SnekType }
  | { kind: "fn"; arity: number }
  | { kind: "unknown" } // not statically knowable — checked by the VM at run time
  | { kind: "none" };   // result of a function that returns no value

// What a name refers to, at one specific use/definition site.
export type Resolution =
  | { kind: "local"; slot: number; code: string } // slot in code object `code` ("<main>" or a function name)
  | { kind: "function"; name: string };

export interface CodeScopeInfo {
  name: string;        // "<main>" or the function name
  params: string[];    // [] for <main>
  nslots: number;      // params occupy slots 0..params.length-1
  slotNames: string[]; // slotNames[slot] = source name (shadowed names repeat)
}

export interface SemanticInfo {
  // type of every Expr node, by node id
  types: Map<number, SnekType>;
  // Identifier node id (reads, assignment targets, call callees) → resolution
  resolutions: Map<number, Resolution>;
  // LetStmt node id / Param node id → slot it defines (in its enclosing code object)
  declSlots: Map<number, number>;
  main: CodeScopeInfo;
  functions: CodeScopeInfo[]; // in declaration order
}

export function typeToString(t: SnekType): string {
  switch (t.kind) {
    case "array": return `array<${typeToString(t.element)}>`;
    case "fn": return `fn(${t.arity})`;
    default: return t.kind;
  }
}
