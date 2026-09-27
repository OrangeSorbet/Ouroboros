// Prose for phase 6 (bytecode emission). bytecode.ts produces raw assembly
// steps; everything a human reads is built here.
import type { Explanation } from "../trace.ts";

const clip = (s: string, n = 48) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const hex = (bytes: number[]) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
const list = (xs: string[]) => clip(xs.length ? xs.map((x, i) => `${i}:${x}`).join(" ") : "(empty)");

export interface EncodeInfo {
  ir: string;
  op: string;
  arg: number;
  bytes: number[];
  prefixes: number;   // EXTENDED_ARG units in front
  isJump: boolean;
  backward: boolean;
  next: number;       // unit index right after the jump unit
  target: number;     // label's unit index (jumps)
  label?: number;
  isLast: boolean;
}

export const asmMessages = {
  beginCode: (name: string, n: number): Explanation => ({
    what: `Start assembling code object ${name} (${n} IR instructions).`,
    why: "Assembly is a deterministic total function IR → bytes: every valid input has exactly one output, so no automaton or search is needed.",
    formal: `assemble(${clip(name, 20)}) = (co_consts, co_names, co_varnames, co_code, co_linetable)`,
    next: "Emit the constant table first: instructions refer to constants by index, not by value.",
  }),

  consts: (name: string, consts: string[]): Explanation => ({
    what: `co_consts of ${clip(name, 20)} = ${list(consts)}`,
    why: "An instruction holds one byte of arg, not a value, so literals live in a table and LOAD_CONST k names row k — code stays fixed-width.",
    formal: "LOAD_CONST k ⇒ push co_consts[k]; the table has no duplicates, so k is unique per value.",
    next: "Emit co_names (functions reached by LOAD_GLOBAL).",
  }),

  names: (names: string[]): Explanation => ({
    what: `co_names = ${list(names)}`,
    why: "Function names are resolved at run time through this table, so a call site stores only an index into it.",
    formal: "LOAD_GLOBAL k ⇒ push function named co_names[k]",
    next: "Emit co_varnames (local slots).",
  }),

  varnames: (varnames: string[]): Explanation => ({
    what: `co_varnames = ${list(varnames)}`,
    why: "Phase 3 already bound every variable to a slot number, so locals are an array indexed by that number — no name lookup at run time.",
    formal: "LOAD_FAST s ⇒ push locals[s];  STORE_FAST s ⇒ locals[s] := pop()",
    next: "Size every instruction: find how many 2-byte units each needs (fixpoint).",
  }),

  fixpoint: (iteration: number, grew: number): Explanation =>
    grew > 0
      ? {
          what: `Sizing pass ${iteration}: ${grew} instruction(s) needed EXTENDED_ARG prefixes, shifting every later position.`,
          why: "A jump's offset counts the units it skips; a prefix adds a unit, so offsets across it grow and may need prefixes too. Repeat until stable.",
          formal: "size(i) = number of bytes needed for arg(i) (min 1); recomputed until no size changes — sizes only grow ⇒ terminates",
          next: `Run sizing pass ${iteration + 1} with the new positions.`,
        }
      : {
          what: `Sizing pass ${iteration}: no instruction grew — positions are final (a fixpoint).`,
          why: "Positions depend on sizes and jump sizes depend on positions; a pass where nothing changes means both agree, so label positions are fixed.",
          formal: "fixpoint: size_k = size_{k−1} for all instructions; sizes are monotone and bounded ⇒ always reached",
          next: "Resolve each label to its final code-unit index.",
        },

  resolveLabel: (label: number, unit: number, offset: number): Explanation => ({
    what: `Label L${label} → unit ${unit} (byte offset ${offset}).`,
    why: "The VM reads numbers, not names: labels were only placeholders for the IR, so each becomes a concrete position in the code.",
    formal: `pos(L${label}) = Σ size(j) for j before L${label} = ${unit}`,
    next: "Encode instructions into bytes, replacing each jump's label with a relative offset.",
  }),

  encode: (e: EncodeInfo): Explanation => {
    const bytes = hex(e.bytes);
    const next = e.isLast ? "Last instruction — finish this code object." : "Encode the next instruction.";
    if (e.isJump) {
      return {
        what: `${e.ir} → offset ${e.backward ? "−" : "+"}${e.arg} → bytes ${bytes}`,
        why: e.prefixes
          ? `Offset ${e.arg} > 255 doesn't fit one byte, so ${e.prefixes} EXTENDED_ARG unit(s) carry the high bits in front.`
          : "Relative offsets make code position-independent: the jump means \"skip n units\", wherever the code object is loaded.",
        formal: e.backward
          ? `offset = (i+1) − pos(L${e.label}) = ${e.next} − ${e.target} = ${e.arg}`
          : `offset = pos(L${e.label}) − (i+1) = ${e.target} − ${e.next} = ${e.arg}`,
        next,
      };
    }
    return {
      what: `${clip(e.ir)} → bytes ${bytes}`,
      why: e.prefixes
        ? `Arg ${e.arg} > 255: wordcode keeps every unit 2 bytes, so ${e.prefixes} EXTENDED_ARG prefix(es) supply the high byte(s).`
        : "Wordcode: every instruction is exactly 2 bytes (opcode, arg), so the VM can fetch and decode without parsing variable lengths.",
      formal: e.prefixes
        ? `arg ${e.arg} = 0x${e.arg.toString(16).toUpperCase()}: high byte(s) in EXTENDED_ARG (0x7F), low byte 0x${hex([e.bytes[e.bytes.length - 1]])} in ${e.op}`
        : `encode(${e.op} ${e.arg}) = [opcode 0x${hex([e.bytes[0]])}, arg 0x${hex([e.bytes[1]])}]`,
      next,
    };
  },

  done: (name: string, nbytes: number): Explanation => ({
    what: `${clip(name, 20)} assembled: ${nbytes} bytes of co_code.`,
    why: "The byte string plus its tables is a complete description of the program — data that the VM (a universal machine) will interpret.",
    formal: "co_code ∈ {0..255}*, |co_code| = 2 × (#units)",
    next: "Assemble the next code object, or hand the bytecode to the VM.",
  }),

  error: (message: string): Explanation => ({
    what: clip(message, 150),
    why: "Assembly is total only on well-formed IR; this input breaks an invariant (a label or jump direction), so no encoding exists.",
    formal: "assemble is defined on IR where every jump names a placed label and conditional jumps go forward",
    next: "Stop: the bytecode phase cannot produce output.",
  }),

  errBadLabel: (ir: string) => `Jump "${ir}" names a label that was never placed.`,
  errBackwardCond: (ir: string) => `Conditional jump "${ir}" targets an earlier position; only JUMP_BACKWARD may jump back.`,
};
