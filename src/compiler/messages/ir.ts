// Prose for Phase 4 (AST → Instructions). irgen.ts records raw events; these
// builders turn them into the four explanation cells. The Formal cell always
// quotes the syntax-directed translation rule of the node being translated
// (docs/phase34plan.md §11.2).
import type { Explanation } from "../trace.ts";
import type { Opcode } from "../irTypes.ts";

// code(·) = the translation scheme; "·" = concatenation of instruction lists.
export const IR_RULES: Record<string, string> = {
  Program: "code(Program) = code(d1) · … · code(dn) · LOAD_CONST none · RETURN_VALUE",
  FuncDecl: "code(fn f(p…) B) = new code object f: code(B) · LOAD_CONST none · RETURN_VALUE",
  LetStmt: "code(let x = e) = code(e) · STORE_FAST slot(x)",
  AssignName: "code(x = e) = code(e) · STORE_FAST slot(x)",
  AssignIndex: "code(a[i] = e) = code(e) · code(a) · code(i) · STORE_SUBSCR",
  PrintStmt: "code(print e) = code(e) · PRINT",
  ExprStmt: "code(e;) = code(e) · POP_TOP",
  ReturnStmt: "code(return e) = code(e) · RETURN_VALUE;  code(return;) = LOAD_CONST none · RETURN_VALUE",
  IfStmt: "code(if c B1 else B2) = code(c) · POP_JUMP_IF_FALSE Le · code(B1) · JUMP_FORWARD Lx · Le: code(B2) · Lx:",
  WhileStmt: "code(while c B) = Lt: code(c) · POP_JUMP_IF_FALSE Lx · code(B) · JUMP_BACKWARD Lt · Lx:",
  ForStmt: "for (i; c; u) B  ⇒  { i; while (c ?? true) { B; u; } }",
  Block: "code({ s1 … sn }) = code(s1) · … · code(sn)",
  BinaryExpr: "code(l op r) = code(l) · code(r) · BINARY_OP op",
  CompareExpr: "code(l rel r) = code(l) · code(r) · COMPARE_OP rel",
  And: "code(a && b) = code(a) · JUMP_IF_FALSE_OR_POP L · code(b) · L:",
  Or: "code(a || b) = code(a) · JUMP_IF_TRUE_OR_POP L · code(b) · L:",
  UnaryExpr: "code(-e) = code(e) · UNARY_NEGATIVE;  code(!e) = code(e) · UNARY_NOT",
  CallExpr: "code(f(a1…an)) = LOAD_GLOBAL f · code(a1) · … · code(an) · CALL n",
  IndexExpr: "code(a[i]) = code(a) · code(i) · BINARY_SUBSCR",
  Literal: "code(k) = LOAD_CONST k   (k stored once in the code object's constant pool)",
  ArrayLiteral: "code([e1 … en]) = code(e1) · … · code(en) · BUILD_LIST n",
  Identifier: "code(x) = LOAD_FAST slot(x)   (slot fixed by Phase 3's name resolution)",
};

const EMIT_WHY: Record<Opcode, string> = {
  LOAD_CONST: "A literal is a leaf of the AST: its value is pushed straight onto the operand stack.",
  LOAD_FAST: "Phase 3 already resolved this name to a slot, so reading it is one indexed load — no lookup by name at run time.",
  STORE_FAST: "The value was computed first (post-order) and sits on top of the stack; STORE_FAST pops it into the variable's slot.",
  LOAD_GLOBAL: "The callee is pushed before the arguments so CALL finds it just below them on the stack.",
  BINARY_OP: "Both operands are already on the stack (post-order), so the operator comes last — a stack machine needs no registers.",
  COMPARE_OP: "Both operands are already on the stack (post-order), so the comparison comes last and pushes a bool.",
  UNARY_NEGATIVE: "The operand is on top of the stack; the operator replaces it with its negation.",
  UNARY_NOT: "The operand is on top of the stack; the operator replaces it with its logical negation.",
  BUILD_LIST: "All n elements are on the stack, left to right; BUILD_LIST pops them and pushes one array.",
  BINARY_SUBSCR: "Array and index are on the stack (post-order); the subscript pops both and pushes the element.",
  STORE_SUBSCR: "The stack holds value, array, index (in that order); STORE_SUBSCR pops all three and writes array[index].",
  CALL: "Callee and n arguments are on the stack; CALL pops them, runs the callee's code object, pushes its result.",
  RETURN_VALUE: "Pops the result and leaves the code object (in <main>: halts). Every path must end in a return.",
  PRINT: "Pops the value and prints it. CPython calls print() as a function; Snek has its own instruction for clarity.",
  POP_TOP: "An expression statement leaves a value nobody uses; popping it keeps the stack balanced (net effect 0).",
  JUMP_FORWARD: "The then-branch must skip over the else-branch. Its end label is not placed yet, so the target is ?.",
  JUMP_BACKWARD: "The loop jumps back to its top label, which is already placed — backward targets need no backpatching.",
  POP_JUMP_IF_FALSE: "The condition picks the branch. The target label comes later in the code, so it is emitted as ? for now.",
  JUMP_IF_FALSE_OR_POP: "Short-circuit: if a is false, a && b is false without evaluating b — skipping b needs a conditional jump.",
  JUMP_IF_TRUE_OR_POP: "Short-circuit: if a is true, a || b is true without evaluating b — skipping b needs a conditional jump.",
};

export const irMessages = {
  // `next` is filled afterwards by irNext() from the following step, so it
  // is always exactly what the walk does next.
  enter: (kind: string, label: string, rule: string): Omit<Explanation, "next"> => ({
    what: `Entered ${kind}${label ? ` ${label}` : ""}.`,
    why: "Post-order walk: a node's own instructions come after its children's, because operands must be on the stack first.",
    formal: rule,
  }),

  emit: (text: string, kind: string, op: Opcode, rule: string, pending: boolean): Omit<Explanation, "next"> => ({
    what: `Emitted ${text}${pending ? " — target unknown, added to the backpatch list" : ""} (for ${kind}).`,
    why: EMIT_WHY[op],
    formal: rule,
  }),

  implicitReturn: (code: string, rule: string): Omit<Explanation, "next"> => ({
    what: `Emitted LOAD_CONST none · RETURN_VALUE at the end of ${code}.`,
    why: "Falling off the end must still return (none), so the VM never runs past the last instruction. Dead copies get removed in Phase 5.",
    formal: rule,
  }),

  label: (label: number, at: number): Omit<Explanation, "next"> => ({
    what: `Placed label L${label} before instruction ${at} (loop top).`,
    why: "The loop top is placed before its condition, so the body's JUMP_BACKWARD can target it — it is known before it is needed.",
    formal: `labels[L${label}] = ${at}   (WhileStmt: Lt: code(c) …)`,
  }),

  patch: (label: number, at: number, jumpIdx: number, jumpOp: string): Omit<Explanation, "next"> => ({
    what: `Placed L${label} at instruction ${at}; patched #${jumpIdx} ${jumpOp} ? → L${label}.`,
    why: "Backpatching: when the jump was emitted its target did not exist yet. Filling the hole now keeps translation one pass.",
    formal: `labels[L${label}] = ${at};  instrs[${jumpIdx}].target := L${label}  (backpatch list shrinks by one)`,
  }),

  beginCode: (name: string, params: string[]): Omit<Explanation, "next"> => ({
    what: `Started a new code object for fn ${name}(${params.join(", ")}).`,
    why: "Each function is its own code object (own slots, constants, instructions) — the unit a call frame runs. Traced where it appears in source.",
    formal: IR_RULES.FuncDecl,
  }),

  desugar: (): Omit<Explanation, "next"> => ({
    what: "Desugared for (init; cond; update) body into { init; while (cond) { body; update; } }.",
    why: "for is syntactic sugar: it adds no expressive power, so it is rewritten into constructs that already have translation rules.",
    formal: IR_RULES.ForStmt,
  }),

  error: (message: string): Explanation => ({
    what: `IR generation stopped: ${message}`,
    why: "Semantic analysis should have rejected this program; the translation scheme has no rule for this node.",
    formal: "code(n) undefined for this node — syntax-directed translation needs a rule per production.",
    next: "Fix the source and recompile.",
  }),

  next: (summary: string) => `Next: ${summary}.`,
  done: "IR complete. Phase 5 splits each code object into basic blocks and optimizes the control-flow graph.",
};
