// Prose for phase 7 (the VM). vm.ts produces raw execution steps (opcode,
// popped/pushed values, control transfer); every sentence is built here.
import type { Explanation } from "../trace.ts";

const clip = (s: string, n = 40) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const vals = (xs: string[]) => clip(xs.join(", "), 44);

export type VmErrorKind = "division" | "type" | "index" | "call" | "arity" | "none" | "halt" | "frames" | "unbound" | "opcode";

export interface VmStepInfo {
  opname: string;
  argrepr: string;
  popped: string[];   // in stack order (deepest first)
  pushed: string[];
  code: string;       // code object that executed the instruction
  nextPc: number;     // byte offset execution continues at (in the resulting top frame)
  flow?: "jump" | "fallthrough" | "call" | "return" | "halt";
  target?: string;    // call: callee; return: caller
}

// Stack effect of each opcode, in the notation [.., a, b] → [.., r].
const EFFECT: Record<string, (arg: string) => string> = {
  LOAD_CONST: (a) => `LOAD_CONST ${a}: [..] → [.., co_consts[k]]`,
  LOAD_FAST: (a) => `LOAD_FAST ${a}: [..] → [.., locals[s]]`,
  STORE_FAST: (a) => `STORE_FAST ${a}: [.., v] → [..];  locals[s] := v`,
  LOAD_GLOBAL: (a) => `LOAD_GLOBAL ${a}: [..] → [.., fn]`,
  BINARY_OP: (a) => `BINARY_OP ${a}: [.., a, b] → [.., a${a}b]`,
  COMPARE_OP: (a) => `COMPARE_OP ${a}: [.., a, b] → [.., a${a}b : bool]`,
  UNARY_NEGATIVE: () => "UNARY_NEGATIVE: [.., a] → [.., −a]",
  UNARY_NOT: () => "UNARY_NOT: [.., a] → [.., ¬a]",
  BUILD_LIST: () => "BUILD_LIST n: [.., x1..xn] → [.., [x1..xn]]",
  BINARY_SUBSCR: () => "BINARY_SUBSCR: [.., arr, i] → [.., arr[i]]",
  STORE_SUBSCR: () => "STORE_SUBSCR: [.., v, arr, i] → [..];  arr[i] := v",
  CALL: () => "CALL n: [.., fn, a1..an] → [..] and push frame(fn, locals = a1..an)",
  RETURN_VALUE: () => "RETURN_VALUE: [.., v] → pop frame; caller's stack [.., v]",
  PRINT: () => "PRINT: [.., v] → [..];  output := output · format(v)",
  POP_TOP: () => "POP_TOP: [.., v] → [..]",
  JUMP_FORWARD: () => "JUMP_FORWARD d: pc := next + 2d  (stack unchanged)",
  JUMP_BACKWARD: () => "JUMP_BACKWARD d: pc := next − 2d  (stack unchanged)",
  POP_JUMP_IF_FALSE: () => "POP_JUMP_IF_FALSE d: [.., c] → [..];  if ¬c: pc := next + 2d",
  JUMP_IF_FALSE_OR_POP: () => "JUMP_IF_FALSE_OR_POP d: [.., c] → if ¬c: [.., c], jump; else [..]",
  JUMP_IF_TRUE_OR_POP: () => "JUMP_IF_TRUE_OR_POP d: [.., c] → if c: [.., c], jump; else [..]",
};

const WHY: Record<string, string> = {
  LOAD_CONST: "Fetch–decode–execute: the VM read the bytes (opcode, arg) as data — a universal machine interpreting another program's description.",
  LOAD_FAST: "Locals are addressable memory beside the stack — storage a one-stack PDA lacks. The slot number was fixed by Phase 3.",
  STORE_FAST: "Writable memory lets any later step depend on any earlier one — tape-like storage, beyond what a single stack allows.",
  LOAD_GLOBAL: "Functions are values: the VM pushes a reference found via co_names; the CALL that follows consumes it.",
  BINARY_OP: "Operands were pushed first (post-order), so the operator pops two and pushes one. Integers are unbounded BigInts.",
  COMPARE_OP: "Comparison turns two values into one bool, which a conditional jump will consume to choose the path.",
  UNARY_NEGATIVE: "A unary operator pops one operand and pushes one result — the stack depth is unchanged.",
  UNARY_NOT: "A unary operator pops one operand and pushes one result — the stack depth is unchanged.",
  BUILD_LIST: "Arrays live in unbounded heap memory: n items leave the stack and one reference to the new array replaces them.",
  BINARY_SUBSCR: "The index is a run-time value, so the bounds check can only happen now — the compiler can't decide it in general.",
  STORE_SUBSCR: "Arrays are mutable heap memory; the bounds check happens at run time because the index isn't known before.",
  CALL: "A call pushes a frame on a second stack. Operand stack + frame stack + unbounded memory ≈ a Turing machine; one stack = a PDA.",
  RETURN_VALUE: "Popping the frame stack resumes the caller at its saved pc (the return address) with the result on the operand stack.",
  PRINT: "PRINT is Snek-specific (CPython calls print as a function); output is the machine's observable result.",
  POP_TOP: "An expression statement's value is unused, so it is discarded to keep the stack balanced.",
  JUMP_FORWARD: "An unconditional jump skips code (e.g. the else branch). The offset is relative, counted in 2-byte units.",
  JUMP_BACKWARD: "Backward jumps are loops. Loops + unbounded integers make Snek Turing-complete — so halting is undecidable.",
  POP_JUMP_IF_FALSE: "The branch reads the bool on top of the stack: the machine's next state depends on data, not only on the code.",
  JUMP_IF_FALSE_OR_POP: "Short-circuit &&: if the left side is false the result is known, so the right side is skipped entirely.",
  JUMP_IF_TRUE_OR_POP: "Short-circuit ||: if the left side is true the result is known, so the right side is skipped entirely.",
};

export function explainVmStep(s: VmStepInfo): Explanation {
  const head = `${s.opname}${s.argrepr ? ` (${clip(s.argrepr, 24)})` : ""}`;
  const effect = [
    s.popped.length ? `popped ${vals(s.popped)}` : "",
    s.pushed.length ? `pushed ${vals(s.pushed)}` : "",
  ].filter(Boolean).join("; ");
  let next: string;
  switch (s.flow) {
    case "jump": next = `Jump taken: fetch the instruction at offset ${s.nextPc}.`; break;
    case "call": next = `Execute ${clip(s.target ?? "", 20)} from offset 0 in its new frame.`; break;
    case "return": next = `Resume ${clip(s.target ?? "", 20)} at offset ${s.nextPc}.`; break;
    case "halt": next = "Halted: <main> returned, so the run is complete and its output is final.";  break;
    default: next = `Fetch the instruction at offset ${s.nextPc}.`;
  }
  const why = s.flow === "halt"
    ? "RETURN_VALUE in <main> is the halting state: nothing is left to resume, so the machine stops."
    : s.opname === "BINARY_OP" && s.argrepr === "/"
      ? "Snek has only integers: / truncates toward zero. A zero divisor is a run-time error, never folded away by the optimizer."
      : WHY[s.opname] ?? "The VM executed one fetched instruction.";
  const fx = EFFECT[s.opname];
  return {
    what: `${head}${effect ? `: ${effect}` : ""}${s.flow === "jump" ? " — jump taken" : ""}.`,
    why,
    formal: fx ? fx(s.argrepr) : s.opname,
    next,
  };
}

const ERROR_WHY: Record<VmErrorKind, string> = {
  division: "Division by zero has no integer result. Whether a divisor is 0 depends on run-time data, so only the VM can detect it.",
  type: "Values here were typed unknown or mixed at compile time; the VM checks the actual runtime types and finds no rule for them.",
  index: "An index is a run-time value; checking it against the array length is only possible now, while the program runs.",
  call: "Only function references can be called; the value on the stack under the arguments is something else.",
  arity: "Each frame has exactly one slot per parameter, so the argument count must match the function's parameter count.",
  none: "The function finished without return, so it produced no value; using that result in an expression is meaningless.",
  halt: "Snek is Turing-complete, so no algorithm decides whether an arbitrary program halts; a step budget is the only safe way out.",
  frames: "Each call pushes a frame; real machines have finite memory, so unbounded recursion must be cut off at a fixed depth.",
  unbound: "A slot was read before any STORE_FAST wrote it, so the frame has no value to push.",
  opcode: "The byte at pc is not in Snek's opcode table, so decode fails: the bytes are not a valid program description.",
};

const ERROR_FORMAL: Record<VmErrorKind, string> = {
  division: "BINARY_OP /: [.., a, 0] → error (a / 0 undefined in ℤ)",
  type: "no typing/evaluation rule matches these operand types → runtime type error",
  index: "BINARY_SUBSCR/STORE_SUBSCR require 0 ≤ i < len(arr)",
  call: "CALL n requires stack[−n−1] to be a function reference",
  arity: "CALL n on fn(p1..pk) requires n = k",
  none: "no value ∉ Value: it may be printed, discarded or returned, not used as an operand",
  halt: "HALT = {⟨P⟩ | P halts} is undecidable (Turing, 1936) ⇒ budget of 10 000 steps",
  frames: "|frame stack| ≤ 256",
  unbound: "LOAD_FAST s requires locals[s] to be assigned",
  opcode: "decode: byte ∉ dom(OPNAME_BY_NUM)",
};

export function explainVmError(kind: VmErrorKind, message: string): Explanation {
  return {
    what: kind === "halt" ? "Stopped after 10 000 steps: the step budget ran out before the program halted." : clip(message, 158),
    why: ERROR_WHY[kind],
    formal: ERROR_FORMAL[kind],
    next: "Execution stops: a runtime error ends the run; output printed so far is kept.",
  };
}

export const vmErrors = {
  division: () => "Runtime error: division by zero.",
  binaryType: (op: string, a: string, b: string) => `Runtime type error: cannot apply ${op} to ${a} and ${b}.`,
  unaryType: (op: string, a: string) => `Runtime type error: cannot apply ${op} to ${a}.`,
  condType: (a: string) => `Runtime type error: condition must be a bool, got ${a}.`,
  notArray: (a: string) => `Runtime type error: cannot index into ${a}.`,
  indexType: (a: string) => `Runtime type error: array index must be an int, got ${a}.`,
  index: (i: string, len: number) => `Runtime error: index ${i} out of range for array of length ${len}.`,
  notFunction: (a: string) => `Runtime error: cannot call ${a} — it is not a function.`,
  unknownFunction: (name: string) => `Runtime error: no function named ${name}.`,
  arity: (name: string, want: number, got: number) => `Runtime error: ${name} expects ${want} argument(s) but got ${got}.`,
  none: () => "Runtime error: function returned no value, but its result was used in an expression.",
  halt: (cap: number) => `Stopped after ${cap.toLocaleString("en-US").replace(",", " ")} steps — no algorithm can decide in general whether a program halts (halting problem), so the VM uses a budget instead.`,
  frames: (cap: number) => `Runtime error: call depth exceeded ${cap} frames (unbounded recursion?).`,
  unbound: (name: string) => `Runtime error: variable ${name} used before it was assigned.`,
  opcode: (byte: number, pc: number) => `Runtime error: invalid opcode 0x${byte.toString(16)} at offset ${pc}.`,
};
