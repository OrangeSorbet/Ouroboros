// Prose for Phase 5 (Control-Flow Graph + Optimize). optimize.ts records raw
// rewrites; these builders produce the explanation cells. Every rewrite cites
// its rule in the Formal cell and justifies why it cannot change behaviour.
import type { Explanation } from "../trace.ts";

type Ex = Omit<Explanation, "next">;

export const optMessages = {
  leaders: (code: string, leaders: number[], first: boolean): Ex => ({
    what: `${code}: found ${leaders.length} leader${leaders.length === 1 ? "" : "s"} at #${leaders.join(", #")}.`,
    why: first
      ? "Snek optimizes only this IR (CPython splits it between AST and flow graph). Blocks start at leaders: control enters only there."
      : "A leader is where control can enter; cutting at leaders gives straight-line blocks with no jump into their middle.",
    formal: "Leaders = {0} ∪ {labels[L] | some jump targets L} ∪ {i+1 | instr i is a jump or RETURN_VALUE}",
  }),

  block: (id: number, start: number, end: number): Ex => ({
    what: `Basic block B${id} = instructions #${start}–#${end}.`,
    why: "A block runs from a leader up to the next leader: once its first instruction runs, all of them run, in order.",
    formal: `B${id} = [${start}, ${end}] — leader ${start} up to (not including) the next leader`,
  }),

  edges: (id: number, desc: string, lastOp: string): Ex => ({
    what: desc ? `B${id} → ${desc}.` : `B${id} ends in ${lastOp}: no successors (exit block).`,
    why: lastOp.startsWith("POP_JUMP") || lastOp.includes("_OR_POP")
      ? "A conditional jump has two successors: the target when it jumps, the next block when it falls through."
      : lastOp.startsWith("JUMP")
        ? "An unconditional jump has exactly one successor, its target; the next block is not reached from here."
        : lastOp === "RETURN_VALUE"
          ? "RETURN_VALUE leaves the code object, so no block follows it in the graph."
          : "The block ends because the next instruction is a leader; control simply falls through into it.",
    formal: "E = {(B, target(B)) | B ends in a jump} ∪ {(B, B+1) | B does not end in an unconditional jump or return}",
  }),

  propagate: (name: string, c: string, block: number): Ex => ({
    what: `Replaced LOAD_FAST ${name} with LOAD_CONST ${c} in B${block}.`,
    why: `Earlier in B${block}, ${name} was set to ${c} and not reassigned. Block-local only: across blocks needs dataflow (reaching definitions).`,
    formal: "LOAD_CONST c · STORE_FAST s · (no STORE_FAST s) · LOAD_FAST s  ⇒  … · LOAD_CONST c",
  }),

  fold: (expr: string, result: string, div: boolean): Ex => ({
    what: `Folded ${expr} into LOAD_CONST ${result}.`,
    why: div
      ? "Both operands are compile-time constants and the divisor is non-zero; BigInt division truncates toward zero, as the VM does."
      : "Both operands are compile-time constants, so the result is too — computing it now changes no observable behaviour.",
    formal: "LOAD_CONST a · LOAD_CONST b · BINARY_OP op  ⇒  LOAD_CONST (a op b)   (likewise COMPARE_OP, unary ops)",
  }),

  foldRefused: (expr: string): Ex => ({
    what: `Did not fold ${expr}.`,
    why: "Dividing by zero is a run-time error. Folding would hide or move it — an optimizer must never change whether an error happens.",
    formal: "fold(a / b) is defined only for b ≠ 0; a rewrite must preserve observable behaviour, errors included.",
  }),

  branchFold: (cond: boolean, op: string, taken: boolean, label: number): Ex => ({
    what: taken
      ? `Condition is constant ${cond}: ${op} L${label} became JUMP_FORWARD L${label}.`
      : `Condition is constant ${cond}: removed LOAD_CONST ${cond} · ${op} (never jumps).`,
    why: taken
      ? "The branch is always taken, so the test is pointless; the untaken edge disappears and its code may become unreachable."
      : "The branch is never taken, so execution always falls through; the jump edge disappears from the graph.",
    formal: op === "POP_JUMP_IF_FALSE"
      ? "LOAD_CONST false · POP_JUMP_IF_FALSE L ⇒ JUMP_FORWARD L;   LOAD_CONST true · POP_JUMP_IF_FALSE L ⇒ ε"
      : "LOAD_CONST c · JUMP_IF_x_OR_POP L ⇒ LOAD_CONST c · JUMP_FORWARD L if the jump fires on c, else ε",
  }),

  dce: (blocks: number[], count: number): Ex => ({
    what: `Removed unreachable block${blocks.length === 1 ? "" : "s"} B${blocks.join(", B")} (${count} instruction${count === 1 ? "" : "s"}).`,
    why: "\"Will this ever run?\" is undecidable (Rice's theorem, via halting). Graph reachability is decidable: sound but incomplete.",
    formal: "Reach = BFS(entry) over CFG edges — O(V+E); delete every block ∉ Reach. Never removes live code, can't find all dead code.",
  }),

  popConst: (c: string): Ex => ({
    what: `Removed LOAD_CONST ${c} · POP_TOP.`,
    why: "Pushing a constant and immediately discarding it has no effect on state or output, so the pair is deleted.",
    formal: "Peephole: LOAD_CONST k · POP_TOP  ⇒  ε",
  }),

  jumpNext: (op: string, label: number): Ex => ({
    what: `Removed ${op} L${label}: it jumps to the very next instruction.`,
    why: "Jumping to where control would fall through anyway is a no-op, so deleting it leaves every path unchanged.",
    formal: "Peephole: JUMP L · L: s  ⇒  L: s",
  }),

  thread: (op: string, from: number, to: number): Ex => ({
    what: `Threaded ${op}: L${from} holds only another jump, so it now targets L${to} directly.`,
    why: "Following a jump that lands on an unconditional jump always ends at the same place; skipping the middle hop saves a step.",
    formal: "Peephole: J L1 · … · L1: JUMP L2  ⇒  J L2 · … (only along acyclic chains of unconditional jumps)",
  }),

  fixpoint: (code: string, rounds: number, before: number, after: number): Ex => ({
    what: `${code}: fixpoint after ${rounds} round${rounds === 1 ? "" : "s"}; ${before} → ${after} instructions.`,
    why: "Each rewrite removes an instruction, turns LOAD_FAST into LOAD_CONST, or shortens a jump chain — all finitely often, so it halts.",
    formal: "repeat { propagate; fold; branch-fold; DCE; peephole } until no rule applies",
  }),

  next: (summary: string) => `Next: ${summary}.`,
  done: "Optimization done. Phase 6 assembles each code object into bytes, resolving labels to jump offsets.",
};
