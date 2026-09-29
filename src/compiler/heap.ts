// Heap objects of the VM (phase 7): the run-time shapes of the M2
// collections, plus the two helper objects the VM keeps on its stack
// (iterators, bound methods). A coil is a plain JS array.
import { formatScalar } from "./values.ts";

export class Scale {
  readonly items: unknown[];
  constructor(items: unknown[]) { this.items = items; }
}

// Hash map / set keyed by hashKey(), so 1 and 1.0 are the same key (as ==
// says) and scales hash by value. Insertion order is kept for printing.
export class Den {
  readonly map = new Map<string, [unknown, unknown]>();
}

export class Clutch {
  readonly map = new Map<string, unknown>();
}

export class Iter {
  pos = 0;
  readonly items: unknown[];
  constructor(items: unknown[]) { this.items = items; }
}

export class BoundMethod {
  readonly self: unknown;
  readonly name: string;
  constructor(self: unknown, name: string) { this.self = self; this.name = name; }
}

// An object of a user class (M3). Every field of the class chain exists
// from allocation on (starting as none); objects never grow new fields.
export class Instance {
  readonly cls: string;
  readonly fields = new Map<string, unknown>();
  constructor(cls: string) { this.cls = cls; }
}

// What LOAD_GLOBAL pushes for a class name; CALL on it builds an object.
export class ClassRef {
  readonly cls: string;
  constructor(cls: string) { this.cls = cls; }
}

export const isHeap = (v: unknown): v is object => typeof v === "object" && v !== null;

export function kindOf(v: unknown): string {
  if (Array.isArray(v)) return "coil";
  if (v instanceof Scale) return "scale";
  if (v instanceof Den) return "den";
  if (v instanceof Clutch) return "clutch";
  if (v instanceof Iter) return "iterator";
  if (v instanceof BoundMethod) return "method";
  if (v instanceof Instance) return v.cls;
  if (v instanceof ClassRef) return "class";
  return "object";
}

// Canonical key of a hashable value; null = not hashable (mutable).
export function hashKey(v: unknown): string | null {
  if (v === null) return "n";
  if (typeof v === "bigint") return `i:${v}`;
  if (typeof v === "number") return Number.isInteger(v) ? `i:${v}` : `f:${v}`;
  if (typeof v === "boolean") return `b:${v}`;
  if (typeof v === "string") return `s:${JSON.stringify(v)}`;
  if (v instanceof Scale) {
    const parts = v.items.map(hashKey);
    return parts.includes(null) ? null : `t:(${parts.join(",")})`;
  }
  return null;
}

// Items a for-each visits, snapshotted when the loop starts (null = not
// iterable). A den yields its keys, a string its characters.
export function iterItems(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return [...v];
  if (v instanceof Scale) return [...v.items];
  if (v instanceof Clutch) return [...v.map.values()];
  if (v instanceof Den) return [...v.map.values()].map(([k]) => k);
  if (typeof v === "string") return [...v];
  return null;
}

export function sizeOf(v: unknown): number | null {
  if (v instanceof Scale) return v.items.length;
  if (v instanceof Den || v instanceof Clutch) return v.map.size;
  return null;
}

// Built-in methods per run-time kind — the same table Phase 3 types
// (semantic.ts methodSig).
export const METHODS: Record<string, readonly string[]> = {
  coil: ["push", "pop", "has", "len"],
  den: ["has", "remove", "keys", "values", "len"],
  clutch: ["add", "has", "remove", "len"],
  scale: ["len"],
  string: ["len"],
};

// `quote`: strings inside collections print with quotes. `seen` stops a
// collection that contains itself from recursing forever.
export function render(v: unknown, quote: boolean, seen: Set<object> = new Set()): string {
  if (!isHeap(v)) return formatScalar(v as never, quote);
  if (v instanceof Iter) return "<iterator>";
  if (v instanceof BoundMethod) return `<method ${v.name}>`;
  if (v instanceof ClassRef) return `<class ${v.cls}>`;
  if ("fn" in v) return `<fn ${(v as { fn: string }).fn}>`;
  if (seen.has(v)) return "…";
  seen.add(v);
  const r = (x: unknown) => render(x, true, seen);
  let s: string;
  if (Array.isArray(v)) s = `[${v.map(r).join(", ")}]`;
  else if (v instanceof Scale) s = `@(${v.items.map(r).join(", ")})`;
  else if (v instanceof Den) s = `@{${[...v.map.values()].map(([k, x]) => `${r(k)}: ${r(x)}`).join(", ")}}`;
  else if (v instanceof Clutch) s = `@[${[...v.map.values()].map(r).join(", ")}]`;
  else if (v instanceof Instance) s = `${v.cls}{${[...v.fields].map(([k, x]) => `${k}: ${r(x)}`).join(", ")}}`;
  else s = "<object>";
  seen.delete(v);
  return s;
}
