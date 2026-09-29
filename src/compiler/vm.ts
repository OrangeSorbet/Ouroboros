// Phase 7 — the virtual machine (docs/phase34plan.md §14). A fetch–decode–
// execute loop over the raw co_code bytes: one shared operand stack, a
// call-frame stack (code object, pc, locals), and an output console. The
// program is data the VM interprets — a universal machine. Two stacks plus
// unbounded memory (BigInts, heap collections) give Turing-machine power, so
// halting is undecidable and the VM runs on a fixed step budget instead.
// Collections live on the heap (heap.ts): the stack and locals hold
// references, shown as `coil #3`, and the heap panel shows the objects.
import type { Chapter, PhaseResult, TraceStep } from "./trace.ts";
import type { BytecodeObject, BytecodeProgram, DisRow, OpName } from "./bytecode.ts";
import { OPCODE_NUM, OPNAME_BY_NUM } from "./bytecode.ts";
import { BINARY_OPS, COMPARE_OPS } from "./irTypes.ts";
import { BUILTINS, arith, callBuiltin, compare, negate } from "./values.ts";
import { BoundMethod, ClassRef, Clutch, Den, Instance, Iter, METHODS, Scale, hashKey, isHeap, iterItems, kindOf, render, sizeOf } from "./heap.ts";
import type { ClassInfo } from "./semanticTypes.ts";
import type { VmErrorKind, VmStepInfo } from "./messages/vm.ts";
import { explainVmError, explainVmStep, vmErrors } from "./messages/vm.ts";

export const STEP_CAP = 10_000;
export const FRAME_CAP = 256;

interface FnRef { fn: string }
type Value = bigint | number | boolean | string | Value[] | FnRef | Scale | Den | Clutch | Iter | BoundMethod | Instance | ClassRef | null;

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
  heap: HeapEntry[]; // objects reachable from the stack and locals, by id
  touched: number[]; // heap ids this instruction read, built or changed
  error?: string;
}

export interface HeapEntry { id: number; kind: string; value: string }

export interface VmOutput { output: string[] }

class VmError extends Error {
  kind: VmErrorKind;
  constructor(kind: VmErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

const isFn = (v: Value): v is FnRef => isHeap(v) && "fn" in v;

function typeName(v: Value): string {
  if (v === null) return "none";
  if (typeof v === "bigint") return "int";
  if (typeof v === "number") return "float";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "string") return "string";
  if (isFn(v)) return "function";
  return kindOf(v);
}

// == on any two values: scalars by value (values.ts), scales structurally,
// everything else (coil, den, clutch) by identity. null = no rule.
function equals(a: Value, b: Value): boolean | null {
  if (a instanceof Scale && b instanceof Scale) {
    if (a.items.length !== b.items.length) return false;
    return a.items.every((x, i) => equals(x as Value, b.items[i] as Value) === true);
  }
  if (isHeap(a) || isHeap(b)) return a === b;
  const r = compare("==", a, b);
  return "error" in r ? null : r.value;
}

interface Frame {
  co: BytecodeObject;
  pc: number;
  locals: (Value | undefined)[];
  view: FrameView["locals"] | null; // cached rendering, cleared when locals may have changed
  base: number; // operand-stack height when the frame started; return cuts back to it
  // Construction frames (M3): a field initializer's result is dropped, and
  // init's result is replaced by the new object.
  discard?: boolean;
  ctor?: Instance;
}

export function run(bc: BytecodeProgram): PhaseResult<VmStep, VmOutput> {
  const trace: VmStep[] = [];
  const chapters: Chapter[] = [];
  const functions = new Map(bc.functions.map((f) => [f.name, f]));
  const classes = new Map((bc.classes ?? []).map((c) => [c.name, c]));
  // The class and its ancestors, leaf first (Phase 3 rejected cycles).
  const chainOf = (cls: string): ClassInfo[] => {
    const out: ClassInfo[] = [];
    for (let c = classes.get(cls); c; c = c.parent ? classes.get(c.parent) : undefined) out.push(c);
    return out;
  };
  // Methods are keyed "name/arity" (M4 overloads); any arity counts as "has it".
  const hasMethod = (c: ClassInfo, name: string) => Object.keys(c.methods).some((k) => k.startsWith(`${name}/`));
  // priv (M4): the running code must belong to the member's own class.
  // Code objects of a class are named "Class.method" / "Class.<fields>".
  const checkPriv = (owner: ClassInfo | undefined, name: string, codeName: string) => {
    if (owner?.priv.includes(name) && !codeName.startsWith(`${owner.name}.`)) throw new VmError("private", vmErrors.privateMember(owner.name, name));
  };
  const rowsByCode = new Map<BytecodeObject, Map<number, DisRow>>();
  const rowAt = (co: BytecodeObject, pc: number) => {
    let m = rowsByCode.get(co);
    if (!m) rowsByCode.set(co, (m = new Map(co.disasm.map((r) => [r.offset, r]))));
    return m.get(pc);
  };

  const stack: Value[] = [];
  const frames: Frame[] = [{ co: bc.main, pc: 0, locals: new Array(bc.main.nslots), view: null, base: 0 }];
  let output: string[] = [];
  let lastMainLine = -1;
  let executed = 0;

  // Heap ids are handed out on first sight, so they stay stable per run.
  const ids = new Map<object, number>();
  const idOf = (o: object) => {
    let n = ids.get(o);
    if (n === undefined) ids.set(o, (n = ids.size + 1));
    return n;
  };
  // Stack / locals show a heap object as a reference; scalars as values.
  const show = (v: Value): string => (isHeap(v) && !isFn(v) ? `${kindOf(v)} #${idOf(v)}` : render(v, true));
  const children = (v: Value): Value[] => {
    if (Array.isArray(v)) return v;
    if (v instanceof Scale || v instanceof Iter) return v.items as Value[];
    if (v instanceof Den) return [...v.map.values()].flat() as Value[];
    if (v instanceof Clutch) return [...v.map.values()] as Value[];
    if (v instanceof BoundMethod) return [v.self as Value];
    if (v instanceof Instance) return [...v.fields.values()] as Value[];
    return [];
  };
  const heapView = (): HeapEntry[] => {
    const seen = new Set<object>();
    const visit = (v: Value) => {
      if (!isHeap(v) || isFn(v) || seen.has(v)) return;
      seen.add(v);
      children(v).forEach(visit);
    };
    stack.forEach(visit);
    for (const fr of frames) fr.locals.forEach((v) => v !== undefined && visit(v));
    return [...seen].map((o) => ({ id: idOf(o), kind: kindOf(o), value: render(o, true) })).sort((a, b) => a.id - b.id);
  };
  const touchedIds = (vs: Value[]): number[] =>
    [...new Set(vs.flatMap((v) => (v instanceof BoundMethod ? [v, v.self as Value] : [v])).filter((v) => isHeap(v) && !isFn(v)).map((v) => idOf(v as object)))];

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
      const done = frames.pop()!;
      stack.length = done.base;
      if (!done.discard) stack.push(done.ctor ?? null);
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
    // An operand must be a real value: none may be stored, passed,
    // compared, printed or returned, but not computed with.
    const use = (v: Value): Value => {
      if (v === null) throw new VmError("none", vmErrors.none());
      return v;
    };
    const bool = (v: Value): boolean => {
      if (typeof use(v) !== "boolean") throw new VmError("type", vmErrors.condType(typeName(v)));
      return v as boolean;
    };
    const position = (i: Value, len: number): number => {
      if (typeof i !== "bigint") throw new VmError("type", vmErrors.indexType(typeName(i)));
      if (i < 0n || i >= BigInt(len)) throw new VmError("index", vmErrors.index(String(i), len));
      return Number(i);
    };
    const keyOf = (k: Value): string => {
      const h = hashKey(k);
      if (h === null) throw new VmError("type", vmErrors.unhashable(typeName(k)));
      return h;
    };
    // An equal key already present stays (1 then 1.0 keeps 1, as in Python);
    // a den only takes the new value.
    const addItem = (c: Clutch, x: Value) => { const h = keyOf(x); if (!c.map.has(h)) c.map.set(h, x); };
    const setEntry = (d: Den, k: Value, v: Value) => { const h = keyOf(k); d.map.set(h, [d.map.get(h)?.[0] ?? k, v]); };
    // Built-in collection methods (heap.ts METHODS); returns the result.
    const callMethod = (self: Value, name: string, args: Value[]): Value => {
      const want = name === "len" || name === "pop" || name === "keys" || name === "values" ? 0 : 1;
      if (args.length !== want) throw new VmError("arity", vmErrors.arity(`${typeName(self)}.${name}`, want, args.length));
      const [x] = args;
      if (name === "len") return BigInt(Array.isArray(self) ? self.length : typeof self === "string" ? [...self].length : sizeOf(self)!);
      if (Array.isArray(self)) {
        if (name === "push") { self.push(x); return null; }
        if (name === "has") return self.some((y) => equals(y, x) === true);
        if (self.length === 0) throw new VmError("index", vmErrors.emptyPop());
        return self.pop()!;
      }
      if (self instanceof Den) {
        if (name === "keys") return [...self.map.values()].map(([k]) => k as Value);
        if (name === "values") return [...self.map.values()].map(([, v]) => v as Value);
        if (name === "has") return self.map.has(keyOf(x));
        self.map.delete(keyOf(x));
        return null;
      }
      const set = self as Clutch;
      if (name === "has") return set.map.has(keyOf(x));
      if (name === "add") addItem(set, x);
      else set.map.delete(keyOf(x));
      return null;
    };

    let flow: VmStepInfo["flow"] = "fallthrough";
    let target: string | undefined;
    let dispatch: string | undefined; // method lookup walk, for the explanation
    let ctor: string | undefined;     // class being constructed
    const pushFrame = (co: BytecodeObject, args: Value[], extra: Partial<Frame> = {}) => {
      if (frames.length >= FRAME_CAP) throw new VmError("frames", vmErrors.frames(FRAME_CAP));
      if (args.length !== co.params.length) throw new VmError("arity", vmErrors.arity(co.name, co.params.length, args.length));
      // Params occupy slots 0..params.length-1 (semanticTypes.ts).
      const locals: (Value | undefined)[] = new Array(co.nslots);
      args.forEach((v, k) => (locals[k] = v));
      frames.push({ co, pc: 0, locals, view: null, base: stack.length, ...extra });
      flow = "call";
      target = co.name;
    };
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
        case "STORE_FAST": f.locals[arg] = pop(); f.view = null; break;
        case "LOAD_GLOBAL": {
          const name = f.co.names[arg];
          if (functions.has(name)) push({ fn: name });
          else if (classes.has(name)) push(new ClassRef(name));
          else throw new VmError("call", vmErrors.unknownFunction(name));
          break;
        }
        case "BINARY_OP": {
          const b = use(pop()), a = use(pop());
          const sym = BINARY_OPS[arg];
          const r = arith(sym, a, b);
          if ("error" in r) {
            if (r.error === "division") throw new VmError("division", vmErrors.division());
            throw new VmError("type", vmErrors.binaryType(sym, typeName(a), typeName(b)));
          }
          push(r.value);
          break;
        }
        case "COMPARE_OP": {
          const b = pop(), a = pop();
          const sym = COMPARE_OPS[arg];
          if (sym === "==" || sym === "!=") {
            const eq = equals(a, b);
            if (eq === null) throw new VmError("type", vmErrors.binaryType(sym, typeName(a), typeName(b)));
            push(eq === (sym === "=="));
            break;
          }
          use(a); use(b);
          const r = compare(sym, a, b);
          if ("error" in r) throw new VmError("type", vmErrors.binaryType(sym, typeName(a), typeName(b)));
          push(r.value);
          break;
        }
        case "UNARY_NEGATIVE": {
          const v = use(pop());
          const r = negate(v);
          if ("error" in r) throw new VmError("type", vmErrors.unaryType("-", typeName(v)));
          push(r.value);
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
          for (let k = 0; k < arg; k++) items.unshift(pop());
          push(items);
          break;
        }
        case "BUILD_SCALE": {
          const items: Value[] = [];
          for (let k = 0; k < arg; k++) items.unshift(pop());
          push(new Scale(items));
          break;
        }
        case "BUILD_CLUTCH": {
          const items: Value[] = [];
          for (let k = 0; k < arg; k++) items.unshift(pop());
          const c = new Clutch();
          for (const x of items) addItem(c, x);
          push(c);
          break;
        }
        case "BUILD_DEN": {
          const flat: Value[] = [];
          for (let k = 0; k < 2 * arg; k++) flat.unshift(pop());
          const d = new Den();
          for (let k = 0; k < flat.length; k += 2) setEntry(d, flat[k], flat[k + 1]);
          push(d);
          break;
        }
        case "LOAD_METHOD": {
          const obj = use(pop());
          const name = f.co.names[arg];
          const kind = typeName(obj);
          const known = obj instanceof Instance ? chainOf(obj.cls).some((c) => hasMethod(c, name)) : METHODS[kind]?.includes(name);
          if (!known) throw new VmError("attr", vmErrors.noMethod(kind, name));
          push(new BoundMethod(obj, name));
          break;
        }
        case "LOAD_ATTR": {
          const obj = use(pop());
          const name = f.co.names[arg];
          if (obj instanceof Instance && obj.fields.has(name)) {
            checkPriv(chainOf(obj.cls).find((c) => c.fields.includes(name)), name, f.co.name);
            push(obj.fields.get(name) as Value);
            break;
          }
          if (obj instanceof Instance && chainOf(obj.cls).some((c) => hasMethod(c, name))) throw new VmError("attr", vmErrors.methodNotCalled(name));
          throw new VmError("attr", vmErrors.noField(typeName(obj), name));
        }
        case "STORE_ATTR": {
          const obj = use(pop()), v = pop();
          const name = f.co.names[arg];
          if (!(obj instanceof Instance) || !obj.fields.has(name)) throw new VmError("attr", vmErrors.noField(typeName(obj), name));
          checkPriv(chainOf(obj.cls).find((c) => c.fields.includes(name)), name, f.co.name);
          obj.fields.set(name, v);
          break;
        }
        case "GET_ITER": {
          const v = use(pop());
          const items = iterItems(v);
          if (!items) throw new VmError("type", vmErrors.notIterable(typeName(v)));
          push(new Iter(items));
          break;
        }
        case "FOR_ITER": {
          const it = stack[stack.length - 1] as Iter;
          if (it.pos < it.items.length) push(it.items[it.pos++] as Value);
          else { pop(); f.pc = next + 2 * arg; flow = "jump"; }
          break;
        }
        case "BINARY_SUBSCR": {
          const i = use(pop()), obj = use(pop());
          if (Array.isArray(obj)) push(obj[position(i, obj.length)]);
          else if (obj instanceof Scale) push(obj.items[position(i, obj.items.length)] as Value);
          else if (obj instanceof Den) {
            const hit = obj.map.get(keyOf(i));
            if (!hit) throw new VmError("key", vmErrors.key(render(i, true)));
            push(hit[1] as Value);
          } else throw new VmError("type", vmErrors.notArray(typeName(obj)));
          break;
        }
        case "STORE_SUBSCR": {
          const i = use(pop()), obj = use(pop()), v = pop();
          if (Array.isArray(obj)) obj[position(i, obj.length)] = v;
          else if (obj instanceof Den) setEntry(obj, i, v);
          else if (obj instanceof Scale) throw new VmError("type", vmErrors.immutable());
          else throw new VmError("type", vmErrors.notArray(typeName(obj)));
          break;
        }
        case "CALL": {
          const args: Value[] = [];
          for (let k = 0; k < arg; k++) args.unshift(pop());
          const fnv = pop();
          if (fnv instanceof BoundMethod && fnv.self instanceof Instance) {
            // Dynamic dispatch: the object's run-time class decides, walking
            // its chain leaf first until some class defines the method.
            // The key includes the argument count, so overloads (M4) are
            // told apart here too.
            const key = `${fnv.name}/${args.length}`;
            const walk: string[] = [];
            let code: string | undefined;
            let owner: ClassInfo | undefined;
            for (const c of chainOf(fnv.self.cls)) {
              code = c.methods[key];
              walk.push(`${c.name}.${fnv.name} ${code ? "✓" : "✗"}`);
              if (code) { owner = c; break; }
            }
            if (!code) throw new VmError("arity", vmErrors.noOverload(`${fnv.self.cls}.${fnv.name}`, args.length));
            checkPriv(owner, fnv.name, f.co.name);
            pushFrame(functions.get(code)!, [fnv.self, ...args]);
            dispatch = walk.join(" → ");
            break;
          }
          if (fnv instanceof BoundMethod) {
            push(callMethod(fnv.self as Value, fnv.name, args));
            break;
          }
          if (fnv instanceof ClassRef) {
            // new C(args): allocate with every field of the chain = none; then
            // frames run (top first) the root's field initializer … the
            // leaf's, then init — whose result is replaced by the object.
            const chain = chainOf(fnv.cls);
            const obj = new Instance(fnv.cls);
            for (const c of [...chain].reverse()) for (const fld of c.fields) obj.fields.set(fld, null);
            const initKey = `init/${args.length}`;
            const initOwner = chain.find((c) => initKey in c.methods);
            if (initOwner) pushFrame(functions.get(initOwner.methods[initKey])!, [obj, ...args], { ctor: obj });
            else if (args.length || chain.some((c) => hasMethod(c, "init"))) throw new VmError("arity", vmErrors.noOverload(`new ${fnv.cls}`, args.length));
            else push(obj);
            for (const c of chain) if (c.fieldsCode) pushFrame(functions.get(c.fieldsCode)!, [obj], { discard: true });
            ctor = fnv.cls;
            break;
          }
          if (!isFn(fnv)) throw new VmError("call", vmErrors.notFunction(typeName(fnv)));
          pushFrame(functions.get(fnv.fn)!, args);
          break;
        }
        case "CALL_BUILTIN": {
          const name = BUILTINS[arg];
          const v = pop();
          const size = name === "len" ? sizeOf(v) : null;
          if (size !== null) { push(BigInt(size)); break; }
          const r = callBuiltin(name, v, (x) => render(x, false));
          if ("error" in r) {
            if (r.error === "value") throw new VmError("value", vmErrors.builtinValue(name, render(v, true)));
            throw new VmError("type", vmErrors.builtinType(name, typeName(v)));
          }
          push(r.value);
          break;
        }
        case "RETURN_VALUE": {
          const v = pop();
          if (frames.length === 1) { flow = "halt"; break; }
          // Anything the frame left behind (e.g. a for-each iterator on an
          // early return) is dropped with it.
          const done = frames.pop()!;
          stack.length = done.base;
          if (!done.discard) push(done.ctor ?? v);
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
        heap: heapView(), touched: touchedIds(popped),
        explain: explainVmError(e.kind, e.message),
      });
      if (chapters.length) chapters[chapters.length - 1].end = trace.length - 1;
      return { ok: false, trace, chapters, error: { message: e.message } };
    }

    const top = frames[frames.length - 1];
    trace.push({
      code: f.co.name, pc, opname, argrepr, line, disasm: f.co.disasm,
      stack: stack.map(show), frames: frameViews(), output,
      heap: heapView(), touched: touchedIds([...popped, ...pushed]),
      explain: explainVmStep({
        opname, argrepr, popped: popped.map(show), pushed: pushed.map(show),
        code: f.co.name, nextPc: top.pc, flow, target, dispatch, ctor,
      }),
    });
    if (flow === "halt") break;
  }

  if (chapters.length) chapters[chapters.length - 1].end = trace.length - 1;
  return { ok: true, trace, chapters, output: { output } };
}
