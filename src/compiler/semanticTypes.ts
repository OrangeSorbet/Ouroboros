// Output contract of Semantic Analysis (phase 3), consumed by IR generation
// (phase 4). Rules: docs/phase34plan.md §7.5 and §10.

export type OrbType =
  | { kind: "int" }
  | { kind: "float" }
  | { kind: "bool" }
  | { kind: "string" }
  | { kind: "array"; element: OrbType }          // shown as coil<T>
  | { kind: "scale"; elements: OrbType[] }       // immutable tuple (M2)
  | { kind: "den"; key: OrbType; value: OrbType } // hash map (M2)
  | { kind: "clutch"; element: OrbType }         // hash set (M2)
  | { kind: "fn"; arity: number }
  | { kind: "obj"; cls: string }                 // instance of a class (M3)
  | { kind: "unknown" } // not statically knowable — checked by the VM at run time
  | { kind: "none" };   // the `none` literal / a function that returns no value

// What a name refers to, at one specific use/definition site.
export type Resolution =
  | { kind: "local"; slot: number; code: string } // slot in code object `code` ("<main>" or a function name)
  | { kind: "function"; name: string }
  | { kind: "builtin"; name: string }; // len / str / int / float (values.ts BUILTINS)

export interface CodeScopeInfo {
  name: string;        // "<main>" or the function name
  params: string[];    // [] for <main>
  nslots: number;      // params occupy slots 0..params.length-1
  slotNames: string[]; // slotNames[slot] = source name (shadowed names repeat)
}

// One class, as IR generation needs it (M3). Methods and the field
// initializer run as ordinary code objects with `self` in slot 0.
export interface ClassInfo {
  name: string;
  parent: string | null;
  abstract: boolean;                // M4: cannot be instantiated
  fields: string[];                 // own fields, declaration order
  // own concrete methods, keyed "name/arity" (M4 overloads by arity) →
  // code object name ("Class.method", or "Class.method/n" when overloaded)
  methods: Record<string, string>;
  priv: string[];                   // M4: own members visible only inside this class
  fieldsCode: string | null;        // "Class.<fields>" when an own field has an initializer
}

export interface SemanticInfo {
  // type of every Expr node, by node id
  types: Map<number, OrbType>;
  // Identifier node id (reads, assignment targets, call callees) → resolution
  resolutions: Map<number, Resolution>;
  // LetStmt node id / Param node id → slot it defines (in its enclosing code object)
  declSlots: Map<number, number>;
  main: CodeScopeInfo;
  functions: CodeScopeInfo[]; // in declaration order (methods and field initializers included)
  classes: ClassInfo[];
  fnCode: Map<number, string>; // FuncDecl node id → its code object name ("add/2" when overloaded)
}

export function typeToString(t: OrbType): string {
  switch (t.kind) {
    case "array": return `coil<${typeToString(t.element)}>`;
    case "scale": return `scale<${t.elements.map(typeToString).join(", ")}>`;
    case "den": return `den<${typeToString(t.key)}, ${typeToString(t.value)}>`;
    case "clutch": return `clutch<${typeToString(t.element)}>`;
    case "fn": return `fn(${t.arity})`;
    case "obj": return t.cls;
    default: return t.kind;
  }
}
