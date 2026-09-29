// Run-time value semantics shared by the VM (phase 7) and the constant
// folder (phase 5), so folding can never disagree with execution.
// int = bigint (unbounded), float = JS number, none = null.
export type Scalar = bigint | number | boolean | string | null;

export type Outcome<T> = { value: T } | { error: "type" | "division" };

export const isNum = (v: unknown): v is bigint | number => typeof v === "bigint" || typeof v === "number";

// Floats always show a dot, so 3.0 never reads as the int 3.
export function formatFloat(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e16) return n.toFixed(1);
  return String(n);
}

export function formatScalar(v: Scalar, quote: boolean): string {
  if (v === null) return "none";
  if (typeof v === "number") return formatFloat(v);
  if (typeof v === "string") return quote ? JSON.stringify(v) : v;
  return String(v);
}

// + - * / % on numbers (and + on strings). int ⊕ int stays int; any float
// operand widens the other side — the only implicit conversion.
export function arith(sym: string, a: unknown, b: unknown): Outcome<Scalar> {
  if (sym === "+" && typeof a === "string" && typeof b === "string") return { value: a + b };
  if (!isNum(a) || !isNum(b)) return { error: "type" };
  if (typeof a === "bigint" && typeof b === "bigint") {
    switch (sym) {
      case "+": return { value: a + b };
      case "-": return { value: a - b };
      case "*": return { value: a * b };
      // BigInt / and % truncate toward zero; % takes the dividend's sign (like C).
      default: return b === 0n ? { error: "division" } : { value: sym === "/" ? a / b : a % b };
    }
  }
  if (sym === "%") return { error: "type" }; // % is int-only
  const x = Number(a), y = Number(b);
  switch (sym) {
    case "+": return { value: x + y };
    case "-": return { value: x - y };
    case "*": return { value: x * y };
    default: return y === 0 ? { error: "division" } : { value: x / y };
  }
}

// == != on scalars (numbers compare across int/float; none equals only
// none); < > <= >= on numbers.
export function compare(sym: string, a: unknown, b: unknown): Outcome<boolean> {
  if (sym === "==" || sym === "!=") {
    let eq: boolean;
    if (a === null || b === null) eq = a === b;
    else if (isNum(a) && isNum(b)) eq = typeof a === typeof b ? a === b : Number(a) === Number(b);
    else if (typeof a === typeof b && (typeof a === "boolean" || typeof a === "string")) eq = a === b;
    else return { error: "type" };
    return { value: eq === (sym === "==") };
  }
  if (!isNum(a) || !isNum(b)) return { error: "type" };
  const [x, y] = typeof a === typeof b ? [a, b] : [Number(a), Number(b)];
  return { value: sym === "<" ? x < y : sym === ">" ? x > y : sym === "<=" ? x <= y : x >= y };
}

export function negate(v: unknown): Outcome<bigint | number> {
  return isNum(v) ? { value: -v } : { error: "type" };
}

// Built-in functions (M1): fixed arity 1, resolved by Phase 3 when no user
// declaration of the name is in scope.
export const BUILTINS = ["len", "str", "int", "float"] as const;
export type Builtin = (typeof BUILTINS)[number];
export const isBuiltin = (name: string): name is Builtin => (BUILTINS as readonly string[]).includes(name);

export type BuiltinOutcome = { value: Scalar } | { error: "type" | "value" };

// `render` is the VM's printer, so str(x) prints exactly what `print x` would.
export function callBuiltin(name: Builtin, v: unknown, render: (v: unknown) => string): BuiltinOutcome {
  switch (name) {
    case "len":
      if (typeof v === "string") return { value: BigInt([...v].length) };
      if (Array.isArray(v)) return { value: BigInt(v.length) };
      return { error: "type" };
    case "str":
      return { value: render(v) };
    case "int":
      if (typeof v === "bigint") return { value: v };
      if (typeof v === "boolean") return { value: v ? 1n : 0n };
      if (typeof v === "number") return Number.isFinite(v) ? { value: BigInt(Math.trunc(v)) } : { error: "value" };
      if (typeof v === "string") return /^\s*-?\d+\s*$/.test(v) ? { value: BigInt(v.trim()) } : { error: "value" };
      return { error: "type" };
    case "float":
      if (typeof v === "number") return { value: v };
      if (typeof v === "bigint") return { value: Number(v) };
      if (typeof v === "string") return /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? { value: Number(v) } : { error: "value" };
      return { error: "type" };
  }
}
