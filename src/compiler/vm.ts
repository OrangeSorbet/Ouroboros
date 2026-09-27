// Phase 7 — the virtual machine (docs/phase34plan.md §14). A fetch–decode–
// execute loop over the raw co_code bytes: one shared operand stack, a
// call-frame stack (code object, pc, locals), and an output console. The
// program is data the VM interprets — a universal machine. Two stacks plus
// unbounded memory (BigInts, arrays) give Turing-machine power, so halting
// is undecidable and the VM runs on a fixed step budget instead.
import type { Chapter, PhaseResult, TraceStep } from "./trace.ts";
import type { BytecodeObject, BytecodeProgram, DisRow, OpName } from "./bytecode.ts";
import { OPCODE_NUM, OPNAME_BY_NUM } from "./bytecode.ts";
import { BINARY_OPS, COMPARE_OPS } from "./irTypes.ts";
import type { VmErrorKind, VmStepInfo } from "./messages/vm.ts";
import { explainVmError, explainVmStep, vmErrors } from "./messages/vm.ts";

export const STEP_CAP = 10_000;
export const FRAME_CAP = 256;

interface FnRef { fn: string }
type Value = bigint | boolean | string | Value[] | FnRef | null;

export interface FrameView {
  code: string;
  pc: number; // byte offset of the next instruction this frame will execute
  locals: { name: string; value: string }[];
}

export interface VmStep extends TraceStep {
  code: string;      // code object the executed instruction belongs to
  pc: number;        // byte offset of the executed instruction (its opcode unit, after any EXTENDED_ARG)
  opname: string;
  argrepr: string;
  line: number;
  disasm: DisRow[];  // that code object's disassembly (shared reference, for the PC listing)
  stack: string[];   // operand stack after the step (rendered, bottom first)
  frames: FrameView[]; // call-frame stack after the step, bottom (<main>) first
  output: string[];  // console output so far
  error?: string;
}

export interface VmOutput { output: string[] }

class VmError extends Error {
  kind: VmErrorKind;
  constructor(kind: VmErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

const isFn = (v: Value): v is FnRef => typeof v === "object" && v !== null && !Array.isArray(v);

function typeName(v: Value): string {
  if (v === null) return "no value";
  if (typeof v === "bigint") return "int";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "string") return "string";
  if (Array.isArray(v)) return "array";
  return "function";
}

// `quote` = render strings with quotes (stack/locals view, and strings
// nested inside arrays when printing). `seen` guards against an array
// stored inside itself.
function render(v: Value, quote: boolean, seen: Set<Value[]> = new Set()): string {
  if (v === null) return "none";
  if (typeof v === "string") return quote ? JSON.stringify(v) : v;
  if (typeof v === "bigint" || typeof v === "boolean") return String(v);
  if (isFn(v)) return `<fn ${v.fn}>`;
  if (seen.has(v)) return "[...]";
  seen.add(v);
  const s = `[${v.map((x) => render(x, true, seen)).join(", ")}]`;
  seen.delete(v);
  return s;
}
const show = (v: Value) => render(v, true);

interface Frame {
  co: BytecodeObject;
  pc: number;
  locals: (Value | undefined)[];
  view: FrameView["locals"] | null; // cached rendering, cleared when locals may have changed
}

export function run(bc: BytecodeProgram): PhaseResult<VmStep, VmOutput> {
  const trace: VmStep[] = [];
  const chapters: Chapter[] = [];
  const functions = new Map(bc.functions.map((f) => [f.name, f]));
  const rowsByCode = new Map<BytecodeObject, Map<number, DisRow>>();
  const rowAt = (co: BytecodeObject, pc: number) => {
    let m = rowsByCode.get(co);
    if (!m) rowsByCode.set(co, (m = new Map(co.disasm.map((r) => [r.offset, r]))));
    return m.get(pc);
  };

  const stack: Value[] = [];
  const frames: Frame[] = [{ co: bc.main, pc: 0, locals: new Array(bc.main.nslots), view: null }];
  let output: string[] = [];
  let lastMainLine = -1;
  let executed = 0;

  const frameViews = (): FrameView[] =>
    frames.map((f) => ({
      code: f.co.name,
      pc: f.pc,
      locals: (f.view ??= f.co.slotNames.map((name, i) => ({ name, value: f.locals[i] === undefined ? "—" : show(f.locals[i]!) }))),
    }));

  for (;;) {
    const f = frames[frames.length - 1];
    if (f.pc >= f.co.code.length) {
      // Fell off the end without RETURN_VALUE: <main> halts, a function
      // returns no value — the same as an explicit bare return.
      if (frames.length === 1) break;
      frames.pop();
      stack.push(null);
      continue;
    }

    // Decode: EXTENDED_ARG units shift their byte into the high bits of
    // the arg of the instruction that follows.
    let pc = f.pc;
    let op = f.co.code[pc];
    let arg = 0;
    while (op === OPCODE_NUM.EXTENDED_ARG) {
      arg = (arg | f.co.code[pc + 1]) << 8;
      pc += 2;
      op = f.co.code[pc];
    }
    arg |= f.co.code[pc + 1];
    const next = pc + 2;
    const opname = OPNAME_BY_NUM.get(op);
    const row = rowAt(f.co, pc);
    const line = row?.line ?? 0;
    const argrepr = row?.argrepr ?? "";

    if (frames.length === 1 && line !== lastMainLine) {
      if (chapters.length) chapters[chapters.length - 1].end = trace.length - 1;
      chapters.push({ start: trace.length, end: trace.length, label: `line ${line}` });
      lastMainLine = line;
    }

    const popped: Value[] = [];
    const pop = (): Value => {
      const v = stack.pop()!;
      popped.unshift(v);
      return v;
    };
    // An operand must be a real value: "no value" (a function that fell
    // off without returning) may only be printed, discarded or returned.
    const use = (v: Value): Value => {
      if (v === null) throw new VmError("none", vmErrors.none());
      return v;
    };
    const ints = (a: Value, b: Value, sym: string): [bigint, bigint] => {
      use(a); use(b);
      if (typeof a !== "bigint" || typeof b !== "bigint") throw new VmError("type", vmErrors.binaryType(sym, typeName(a), typeName(b)));
      return [a, b];
    };
    const bool = (v: Value): boolean => {
      if (typeof use(v) !== "boolean") throw new VmError("type", vmErrors.condType(typeName(v)));
      return v as boolean;
    };
    const arrayIndex = (arr: Value, i: Value): [Value[], number] => {
      use(arr); use(i);
      if (!Array.isArray(arr)) throw new VmError("type", vmErrors.notArray(typeName(arr)));
      if (typeof i !== "bigint") throw new VmError("type", vmErrors.indexType(typeName(i)));
      if (i < 0n || i >= BigInt(arr.length)) throw new VmError("index", vmErrors.index(String(i), arr.length));
      return [arr, Number(i)];
    };

    let flow: VmStepInfo["flow"] = "fallthrough";
    let target: string | undefined;
    const pushed: Value[] = [];
    const push = (v: Value) => { stack.push(v); pushed.push(v); };

    try {
      if (executed >= STEP_CAP) throw new VmError("halt", vmErrors.halt(STEP_CAP));
      if (!opname || opname === "EXTENDED_ARG") throw new VmError("opcode", vmErrors.opcode(op, pc));
      executed++;
      f.pc = next;
      switch (opname as Exclude<OpName, "EXTENDED_ARG">) {
        case "LOAD_CONST": push(f.co.consts[arg]); break;
        case "LOAD_FAST": {
          const v = f.locals[arg];
          if (v === undefined) throw new VmError("unbound", vmErrors.unbound(f.co.slotNames[arg] ?? `slot ${arg}`));
          push(v);
          break;
        }
        case "STORE_FAST": f.locals[arg] = use(pop()); f.view = null; break;
        case "LOAD_GLOBAL": {
          const name = f.co.names[arg];
          if (!functions.has(name)) throw new VmError("call", vmErrors.unknownFunction(name));
          push({ fn: name });
          break;
        }
        case "BINARY_OP": {
          const b = pop(), a = pop();
          const sym = BINARY_OPS[arg];
          if (sym === "+" && typeof a === "string" && typeof b === "string") { push(a + b); break; }
          const [x, y] = ints(a, b, sym);
          if (sym === "+") push(x + y);
          else if (sym === "-") push(x - y);
          else if (sym === "*") push(x * y);
          else {
            if (y === 0n) throw new VmError("division", vmErrors.division());
            push(x / y); // BigInt division already truncates toward zero
          }
          break;
        }
        case "COMPARE_OP": {
          const b = use(pop()), a = use(pop());
          const sym = COMPARE_OPS[arg];
          if (sym === "==" || sym === "!=") {
            const scalar = (v: Value) => typeof v === "bigint" || typeof v === "boolean" || typeof v === "string";
            if (!scalar(a) || typeof a !== typeof b) throw new VmError("type", vmErrors.binaryType(sym, typeName(a), typeName(b)));
            push(sym === "==" ? a === b : a !== b);
          } else {
            const [x, y] = ints(a, b, sym);
            push(sym === "<" ? x < y : sym === ">" ? x > y : sym === "<=" ? x <= y : x >= y);
          }
          break;
        }
        case "UNARY_NEGATIVE": {
          const v = use(pop());
          if (typeof v !== "bigint") throw new VmError("type", vmErrors.unaryType("-", typeName(v)));
          push(-v);
          break;
        }
        case "UNARY_NOT": {
          const v = use(pop());
          if (typeof v !== "boolean") throw new VmError("type", vmErrors.unaryType("!", typeName(v)));
          push(!v);
          break;
        }
        case "BUILD_LIST": {
          const items: Value[] = [];
          for (let k = 0; k < arg; k++) items.unshift(use(pop()));
          push(items);
          break;
        }
        case "BINARY_SUBSCR": {
          const i = pop(), arr = pop();
          const [a, n] = arrayIndex(arr, i);
          push(a[n]);
          break;
        }
        case "STORE_SUBSCR": {
          const i = pop(), arr = pop(), v = use(pop());
          const [a, n] = arrayIndex(arr, i);
          a[n] = v;
          for (const fr of frames) fr.view = null; // the array may be visible from any frame
          break;
        }
        case "CALL": {
          const args: Value[] = [];
          for (let k = 0; k < arg; k++) args.unshift(use(pop()));
          const fnv = pop();
          if (!isFn(fnv)) throw new VmError("call", vmErrors.notFunction(fnv === null ? "no value" : typeName(fnv)));
          const co = functions.get(fnv.fn)!;
          if (args.length !== co.params.length) throw new VmError("arity", vmErrors.arity(co.name, co.params.length, args.length));
          if (frames.length >= FRAME_CAP) throw new VmError("frames", vmErrors.frames(FRAME_CAP));
          // Params occupy slots 0..params.length-1 (semanticTypes.ts).
          const locals: (Value | undefined)[] = new Array(co.nslots);
          args.forEach((v, k) => (locals[k] = v));
          frames.push({ co, pc: 0, locals, view: null });
          flow = "call";
          target = co.name;
          break;
        }
        case "RETURN_VALUE": {
          const v = pop();
          if (frames.length === 1) { flow = "halt"; break; }
          frames.pop();
          push(v);
          flow = "return";
          target = frames[frames.length - 1].co.name;
          break;
        }
        case "PRINT": output = [...output, render(pop(), false)]; break;
        case "POP_TOP": pop(); break;
        case "JUMP_FORWARD": f.pc = next + 2 * arg; flow = "jump"; break;
        case "JUMP_BACKWARD": f.pc = next - 2 * arg; flow = "jump"; break;
        case "POP_JUMP_IF_FALSE":
          if (!bool(pop())) { f.pc = next + 2 * arg; flow = "jump"; }
          break;
        case "JUMP_IF_FALSE_OR_POP":
        case "JUMP_IF_TRUE_OR_POP": {
          const c = bool(stack[stack.length - 1]);
          if (c === (opname === "JUMP_IF_TRUE_OR_POP")) { f.pc = next + 2 * arg; flow = "jump"; }
          else pop();
          break;
        }
      }
    } catch (e) {
      if (!(e instanceof VmError)) throw e;
      // Undo this instruction's partial effects so the error step shows
      // the machine exactly as it was when the instruction was fetched.
      stack.length -= pushed.length;
      stack.push(...popped);
      f.pc = pc;
      trace.push({
        code: f.co.name, pc, opname: opname ?? `0x${op.toString(16)}`, argrepr, line, disasm: f.co.disasm,
        stack: stack.map(show), frames: frameViews(), output, error: e.message,
        explain: explainVmError(e.kind, e.message),
      });
      if (chapters.length) chapters[chapters.length - 1].end = trace.length - 1;
      return { ok: false, trace, chapters, error: { message: e.message } };
    }

    const top = frames[frames.length - 1];
    trace.push({
      code: f.co.name, pc, opname, argrepr, line, disasm: f.co.disasm,
      stack: stack.map(show), frames: frameViews(), output,
      explain: explainVmStep({
        opname, argrepr, popped: popped.map(show), pushed: pushed.map(show),
        code: f.co.name, nextPc: top.pc, flow, target,
      }),
    });
    if (flow === "halt") break;
  }

  if (chapters.length) chapters[chapters.length - 1].end = trace.length - 1;
  return { ok: true, trace, chapters, output: { output } };
}
