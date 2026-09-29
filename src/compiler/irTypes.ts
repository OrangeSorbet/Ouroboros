// Intermediate representation: CPython-inspired stack-machine instructions
// (docs/phase34plan.md §11.1). Produced by IR generation (phase 4),
// rewritten by the optimizer (phase 5, same shape), assembled to bytes in
// phase 6. Jumps target *labels*, not indices, until assembly.
import { BUILTINS, formatFloat } from "./values.ts";
import type { ClassInfo } from "./semanticTypes.ts";

export const OPCODES = [
  "LOAD_CONST",           // arg = index into consts            → push consts[arg]
  "LOAD_FAST",            // arg = slot                          → push locals[arg]
  "STORE_FAST",           // arg = slot                          v →        (locals[arg] = v)
  "LOAD_GLOBAL",          // arg = index into names (fn name)    → push function
  "BINARY_OP",            // arg = index into BINARY_OPS         a b → a op b
  "COMPARE_OP",           // arg = index into COMPARE_OPS        a b → bool
  "UNARY_NEGATIVE",       //                                     a → -a
  "UNARY_NOT",            //                                     a → !a
  "BUILD_LIST",           // arg = n                             x1..xn → coil
  "BUILD_SCALE",          // arg = n                             x1..xn → scale
  "BUILD_DEN",            // arg = n pairs                       k1 v1..kn vn → den
  "BUILD_CLUTCH",         // arg = n                             x1..xn → clutch
  "LOAD_METHOD",          // arg = index into names (method)     obj → obj.method (bound)
  "LOAD_ATTR",            // arg = index into names (field)      obj → obj.field
  "STORE_ATTR",           // arg = index into names (field)      v obj →  (obj.field = v)
  "GET_ITER",             //                                     seq → iterator
  "FOR_ITER",             // target = label (forward)            it → it x  (exhausted: pop it, jump)
  "BINARY_SUBSCR",        //                                     arr i → arr[i]
  "STORE_SUBSCR",         //                                     v arr i →  (arr[i] = v)
  "CALL",                 // arg = n args                        fn a1..an → result
  "CALL_BUILTIN",         // arg = index into BUILTINS           a → f(a)
  "RETURN_VALUE",         //                                     v →  (return v; <main>: halt)
  "PRINT",                //                                     v →  (append to output)
  "POP_TOP",              //                                     v →
  "JUMP_FORWARD",         // target = label (placed after this instr)
  "JUMP_BACKWARD",        // target = label (placed at/before this instr) — loops only
  "POP_JUMP_IF_FALSE",    // target = label (forward)            c →  (jump if c is false)
  "JUMP_IF_FALSE_OR_POP", // target = label (forward)            c → c (if false: jump, keep c; else pop)
  "JUMP_IF_TRUE_OR_POP",  // target = label (forward)            c → c (if true: jump, keep c; else pop)
] as const;
export type Opcode = (typeof OPCODES)[number];

export const BINARY_OPS = ["+", "-", "*", "/", "%"] as const;
export const COMPARE_OPS = ["==", "!=", "<", ">", "<=", ">="] as const;

export const JUMP_OPS: ReadonlySet<Opcode> = new Set<Opcode>([
  "JUMP_FORWARD", "JUMP_BACKWARD", "POP_JUMP_IF_FALSE", "JUMP_IF_FALSE_OR_POP", "JUMP_IF_TRUE_OR_POP", "FOR_ITER",
]);

// bigint = int, number = float, null = none.
export type IrConst = bigint | number | boolean | string | null;

export interface IrInstr {
  op: Opcode;
  arg?: number;    // meaning per opcode above; absent for no-arg opcodes and jumps
  target?: number; // jumps only: label id
  line: number;    // source line (for the line table / highlighting)
  astId?: number;  // AST node that produced it (for the phase-4 walk)
}

export interface CodeObject {
  name: string;        // "<main>" or function name
  params: string[];
  nslots: number;
  slotNames: string[];
  consts: IrConst[];   // no duplicates (compare with Object.is / ===)
  names: string[];     // function / class names (LOAD_GLOBAL), method and field names (LOAD_METHOD, *_ATTR)
  instrs: IrInstr[];
  // labels[labelId] = index in `instrs` of the instruction the label sits
  // before (may equal instrs.length = end of code).
  labels: number[];
}

export interface IrProgram {
  main: CodeObject;
  functions: CodeObject[];     // functions, methods ("Class.m") and field initializers ("Class.<fields>")
  classes?: ClassInfo[];       // M3; absent in hand-built fixtures
}

// Canonical one-line rendering used by every IR/bytecode view, e.g.
// "LOAD_CONST 0 (3)", "POP_JUMP_IF_FALSE L2", "BINARY_OP 0 (+)".
export function formatInstr(ins: IrInstr, code: CodeObject): string {
  if (ins.target !== undefined) return `${ins.op} L${ins.target}`;
  if (ins.arg === undefined) return ins.op;
  const a = ins.arg;
  switch (ins.op) {
    case "LOAD_CONST": return `${ins.op} ${a} (${formatConst(code.consts[a])})`;
    case "LOAD_FAST":
    case "STORE_FAST": return `${ins.op} ${a} (${code.slotNames[a] ?? "?"})`;
    case "LOAD_GLOBAL":
    case "LOAD_METHOD":
    case "LOAD_ATTR":
    case "STORE_ATTR": return `${ins.op} ${a} (${code.names[a] ?? "?"})`;
    case "BINARY_OP": return `${ins.op} ${a} (${BINARY_OPS[a]})`;
    case "COMPARE_OP": return `${ins.op} ${a} (${COMPARE_OPS[a]})`;
    case "CALL_BUILTIN": return `${ins.op} ${a} (${BUILTINS[a]})`;
    default: return `${ins.op} ${a}`;
  }
}

export function formatConst(c: IrConst): string {
  if (c === null) return "none";
  if (typeof c === "number") return formatFloat(c);
  if (typeof c === "string") return JSON.stringify(c);
  return String(c);
}
