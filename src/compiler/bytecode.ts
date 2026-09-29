// Phase 6 — bytecode emission (docs/phase34plan.md §13). Turns each IR code
// object into CPython-style wordcode: every instruction is exactly 2 bytes
// (opcode, arg), jumps become *relative* offsets in instruction units, and
// an arg that doesn't fit in one byte gets EXTENDED_ARG prefix units that
// each carry 8 more high bits. This is a deterministic total function on
// IrProgram — no automaton, just a computable translation.
import type { Chapter, PhaseResult, TraceStep } from "./trace.ts";
import type { CodeObject, IrInstr, IrProgram, Opcode } from "./irTypes.ts";
import { BINARY_OPS, COMPARE_OPS, JUMP_OPS, formatConst, formatInstr, type IrConst } from "./irTypes.ts";
import { asmMessages } from "./messages/bytecode.ts";
import type { ClassInfo } from "./semanticTypes.ts";

// Ouroboros's own opcode numbering (deliberately not CPython's numbers). Like
// CPython's HAVE_ARGUMENT split, opcodes below 0x20 ignore their arg byte
// (it is always 0); 0x20 and up use it. POP_JUMP_IF_FALSE = 0x2C, so a jump
// three units ahead encodes as the bytes `2C 03`.
export const OPCODE_NUM = {
  UNARY_NEGATIVE: 0x01,
  UNARY_NOT: 0x02,
  BINARY_SUBSCR: 0x03,
  STORE_SUBSCR: 0x04,
  RETURN_VALUE: 0x05,
  PRINT: 0x06,
  POP_TOP: 0x07,
  GET_ITER: 0x08,
  LOAD_CONST: 0x20,
  LOAD_FAST: 0x21,
  STORE_FAST: 0x22,
  LOAD_GLOBAL: 0x23,
  BINARY_OP: 0x24,
  COMPARE_OP: 0x25,
  BUILD_LIST: 0x26,
  CALL: 0x27,
  JUMP_FORWARD: 0x28,
  JUMP_BACKWARD: 0x29,
  JUMP_IF_FALSE_OR_POP: 0x2a,
  JUMP_IF_TRUE_OR_POP: 0x2b,
  POP_JUMP_IF_FALSE: 0x2c,
  CALL_BUILTIN: 0x2d,
  BUILD_SCALE: 0x2e,
  BUILD_DEN: 0x2f,
  BUILD_CLUTCH: 0x30,
  LOAD_METHOD: 0x31,
  FOR_ITER: 0x32,
  LOAD_ATTR: 0x33,
  STORE_ATTR: 0x34,
  EXTENDED_ARG: 0x7f,
} as const satisfies Record<Opcode | "EXTENDED_ARG", number>;
export type OpName = keyof typeof OPCODE_NUM;
export const HAVE_ARGUMENT = 0x20;

export const OPNAME_BY_NUM: ReadonlyMap<number, OpName> = new Map(
  (Object.entries(OPCODE_NUM) as [OpName, number][]).map(([name, num]) => [num, name]),
);

export interface DisRow {
  offset: number;      // byte offset of this 2-byte unit
  opname: OpName;
  arg: number | null;  // full decoded arg (null for opcodes that ignore it)
  argrepr: string;     // resolved meaning, like dis's parenthesised column
  line: number;
  bytes: number[];     // the two raw bytes [opcode, arg-low-byte]
}

export interface BytecodeObject {
  name: string;
  params: string[];
  nslots: number;
  slotNames: string[];                         // co_varnames
  consts: IrConst[]; // co_consts
  names: string[];                             // co_names
  code: number[];                              // co_code (bytes)
  lineTable: { offset: number; line: number }[]; // start byte offset of each run of one source line
  disasm: DisRow[];
}

export interface BytecodeProgram {
  main: BytecodeObject;
  functions: BytecodeObject[];
  classes?: ClassInfo[]; // M3, passed through from the IR
}

export type AsmAction = "begin-code" | "const-table" | "resolve-label" | "encode" | "fixpoint" | "done" | "error";

export interface AsmTables {
  consts: string[];
  names: string[];
  varnames: string[];
}

export interface AsmStep extends TraceStep {
  action: AsmAction;
  code: string;                 // code object being assembled
  tables: AsmTables;            // the code object's tables (shared per code object)
  tablesShown: number;          // how many of consts/names/varnames have been emitted (0–3)
  disasmSoFar: DisRow[];
  labelMap?: { label: number; unit: number; offset: number }[]; // label → code-unit index / byte offset
  current?: number;             // index into disasmSoFar of the row this step produced/concerns
  iteration?: number;           // fixpoint: iteration number (1-based)
  grew?: number;                // fixpoint: how many instructions needed more prefix units
  encoding?: {                  // encode: the big "IR → offset → bytes" line
    ir: string;
    opnum: number;
    arg: number;
    offsetNote?: string;        // jumps: e.g. "+3" / "−5"
    bytes: number[];            // every byte this instruction produced, prefixes included
  };
}

const EXT = OPCODE_NUM.EXTENDED_ARG;

// Units needed so that `arg` fits: 1 for 0–255, then one EXTENDED_ARG per
// extra byte of value.
function unitsFor(arg: number): number {
  let n = 1;
  while (arg > 0xff) { arg >>>= 8; n++; }
  return n;
}

const hex = (b: number) => b.toString(16).toUpperCase().padStart(2, "0");
export const hexBytes = (bytes: number[]) => bytes.map(hex).join(" ");

function argreprFor(ins: IrInstr, co: CodeObject, arg: number, targetOffset?: number): string {
  if (ins.target !== undefined) return `to ${targetOffset} (L${ins.target})`;
  switch (ins.op) {
    case "LOAD_CONST": return formatConst(co.consts[arg] ?? null);
    case "LOAD_FAST":
    case "STORE_FAST": return co.slotNames[arg] ?? "?";
    case "LOAD_GLOBAL":
    case "LOAD_METHOD":
    case "LOAD_ATTR":
    case "STORE_ATTR": return co.names[arg] ?? "?";
    case "BINARY_OP": return BINARY_OPS[arg] ?? "?";
    case "COMPARE_OP": return COMPARE_OPS[arg] ?? "?";
    default: return "";
  }
}

class Assembler {
  trace: AsmStep[] = [];
  chapters: Chapter[] = [];

  emit(step: Omit<AsmStep, "explain">, explain: AsmStep["explain"]) {
    this.trace.push({ ...step, explain });
  }

  // Returns null (after pushing an error step) when the IR breaks an
  // invariant the assembler relies on.
  assembleCode(co: CodeObject): BytecodeObject | null {
    const start = this.trace.length;
    const tables: AsmTables = {
      consts: co.consts.map(formatConst),
      names: [...co.names],
      varnames: [...co.slotNames],
    };
    const base = { code: co.name, tables, disasmSoFar: [] as DisRow[] };
    const n = co.instrs.length;
    this.emit({ ...base, action: "begin-code", tablesShown: 0 }, asmMessages.beginCode(co.name, n));
    this.emit({ ...base, action: "const-table", tablesShown: 1 }, asmMessages.consts(co.name, tables.consts));
    this.emit({ ...base, action: "const-table", tablesShown: 2 }, asmMessages.names(tables.names));
    this.emit({ ...base, action: "const-table", tablesShown: 3 }, asmMessages.varnames(tables.varnames));

    const fail = (message: string) => {
      this.emit({ ...base, action: "error", tablesShown: 3 }, asmMessages.error(message));
      this.chapters.push({ start, end: this.trace.length - 1, label: co.name === "<main>" ? "<main>" : `fn ${co.name}` });
      this.error = message;
      return null;
    };

    // Unconditional jumps are normalised to the direction their target
    // actually lies in (as CPython's assembler does), because a relative
    // offset is unsigned: direction lives in the opcode, magnitude in the arg.
    const ops: Opcode[] = [];
    for (let i = 0; i < n; i++) {
      const ins = co.instrs[i];
      let op = ins.op;
      if (JUMP_OPS.has(op)) {
        if (ins.target === undefined || co.labels[ins.target] === undefined) {
          return fail(asmMessages.errBadLabel(formatInstr(ins, co)));
        }
        const backward = co.labels[ins.target] <= i;
        if (op === "JUMP_FORWARD" && backward) op = "JUMP_BACKWARD";
        else if (op === "JUMP_BACKWARD" && !backward) op = "JUMP_FORWARD";
        else if (op !== "JUMP_BACKWARD" && backward) return fail(asmMessages.errBackwardCond(formatInstr(ins, co)));
      }
      ops.push(op);
    }

    // Sizes in code units. Non-jump args are known now; a jump's offset
    // depends on the sizes of everything it jumps over — which may
    // themselves be jumps that grow — so iterate until nothing grows.
    // Sizes only ever increase, so this reaches a fixpoint.
    const size = co.instrs.map((ins, i) => (JUMP_OPS.has(ops[i]) ? 1 : unitsFor(ins.arg ?? 0)));
    let pos: number[] = [];
    let args: number[] = [];
    const labelUnit = (label: number) => pos[co.labels[label]];
    for (let iteration = 1; ; iteration++) {
      pos = [];
      let p = 0;
      for (let i = 0; i < n; i++) { pos.push(p); p += size[i]; }
      pos.push(p); // position of "end of code", for labels placed after the last instruction
      args = co.instrs.map((ins, i) => {
        if (!JUMP_OPS.has(ops[i])) return ins.arg ?? 0;
        const next = pos[i] + size[i]; // unit index right after the jump unit itself
        const target = labelUnit(ins.target!);
        return ops[i] === "JUMP_BACKWARD" ? next - target : target - next;
      });
      let grew = 0;
      for (let i = 0; i < n; i++) {
        const need = unitsFor(args[i]);
        if (need > size[i]) { size[i] = need; grew++; }
      }
      const labelMap = co.labels.map((_, label) => ({ label, unit: labelUnit(label), offset: labelUnit(label) * 2 }));
      this.emit({ ...base, action: "fixpoint", tablesShown: 3, labelMap, iteration, grew }, asmMessages.fixpoint(iteration, grew));
      if (grew === 0) break;
    }

    const labelMap = co.labels.map((_, label) => ({ label, unit: labelUnit(label), offset: labelUnit(label) * 2 }));
    for (const lm of labelMap) {
      this.emit({ ...base, action: "resolve-label", tablesShown: 3, labelMap }, asmMessages.resolveLabel(lm.label, lm.unit, lm.offset));
    }

    const code: number[] = [];
    const disasm: DisRow[] = [];
    const lineTable: BytecodeObject["lineTable"] = [];
    for (let i = 0; i < n; i++) {
      const ins = co.instrs[i];
      const op = ops[i];
      const arg = args[i];
      const isJump = JUMP_OPS.has(op);
      const targetOffset = isJump ? labelUnit(ins.target!) * 2 : undefined;
      const takesArg = OPCODE_NUM[op] >= HAVE_ARGUMENT;
      const produced: number[] = [];
      for (let k = size[i] - 1; k >= 0; k--) {
        const offset = code.length;
        const isPrefix = k > 0;
        const bytes = [isPrefix ? EXT : OPCODE_NUM[op], (arg >>> (8 * k)) & 0xff];
        code.push(...bytes);
        produced.push(...bytes);
        if (lineTable.length === 0 || lineTable[lineTable.length - 1].line !== ins.line) lineTable.push({ offset, line: ins.line });
        disasm.push({
          offset,
          opname: isPrefix ? "EXTENDED_ARG" : op,
          arg: isPrefix ? arg >>> (8 * k) : takesArg ? arg : null,
          argrepr: isPrefix ? "" : argreprFor(ins, co, arg, targetOffset),
          line: ins.line,
          bytes,
        });
      }
      const irText = formatInstr({ ...ins, op }, co);
      const offsetNote = isJump ? `${op === "JUMP_BACKWARD" ? "−" : "+"}${arg}` : undefined;
      this.emit(
        {
          ...base,
          action: "encode",
          tablesShown: 3,
          labelMap,
          disasmSoFar: disasm.slice(),
          current: disasm.length - 1,
          encoding: { ir: irText, opnum: OPCODE_NUM[op], arg, offsetNote, bytes: produced },
        },
        asmMessages.encode({
          ir: irText, op, arg, bytes: produced, prefixes: size[i] - 1, isJump,
          backward: op === "JUMP_BACKWARD", next: pos[i] + size[i], target: isJump ? labelUnit(ins.target!) : 0,
          label: ins.target, isLast: i === n - 1,
        }),
      );
    }

    this.emit({ ...base, action: "done", tablesShown: 3, labelMap, disasmSoFar: disasm.slice() }, asmMessages.done(co.name, code.length));
    this.chapters.push({ start, end: this.trace.length - 1, label: co.name === "<main>" ? "<main>" : `fn ${co.name}` });
    return {
      name: co.name,
      params: co.params,
      nslots: co.nslots,
      slotNames: co.slotNames,
      consts: co.consts,
      names: co.names,
      code,
      lineTable,
      disasm,
    };
  }

  error?: string;
}

export function assemble(ir: IrProgram): PhaseResult<AsmStep, BytecodeProgram> {
  const asm = new Assembler();
  // Functions first, then <main>: matches source order for programs that
  // declare functions before top-level code, like demo.orbs.
  const functions: BytecodeObject[] = [];
  for (const fn of ir.functions) {
    const obj = asm.assembleCode(fn);
    if (!obj) return { ok: false, trace: asm.trace, chapters: asm.chapters, error: { message: asm.error! } };
    functions.push(obj);
  }
  const main = asm.assembleCode(ir.main);
  if (!main) return { ok: false, trace: asm.trace, chapters: asm.chapters, error: { message: asm.error! } };
  return { ok: true, trace: asm.trace, chapters: asm.chapters, output: { main, functions, classes: ir.classes } };
}
