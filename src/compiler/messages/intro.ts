import type { PhaseId } from "../trace.ts";

// One primer card per phase, shown when the user zooms into it. The
// `whyNeeded` paragraphs together tell the Chomsky-ladder story of
// docs/phase34plan.md §2: each phase exists because the machine before it
// provably cannot do its job.

export interface IntroCardContent {
  title: string;
  does: string;       // what the phase does, in one or two sentences
  model: string;      // its machine / model of computation
  input: string;
  output: string;
  whyNeeded: string;  // why the previous phase's machine can't do this
  sketch?: string[];  // optional formal sketch (proof idea / theorem), rendered monospace
}

export const INTRO_CARDS: Record<PhaseId, IntroCardContent> = {
  lex: {
    title: "Phase 1 · Lexical Analysis",
    does: "Reads the source one character at a time and groups characters into tokens (keywords, names, numbers, operators), skipping whitespace and comments.",
    model: "A DFA (Q, Σ, δ, q₀, F) over character classes, driven by a longest-match scanner loop that restarts the DFA after each token.",
    input: "a string of characters",
    output: "a list of tokens, ending in EOF",
    whyNeeded: "It's the first phase. Token shapes (an identifier is a letter followed by letters/digits) are regular languages, so finite memory, one state and no stack, is all it needs.",
  },
  parse: {
    title: "Phase 2 · Syntax Analysis",
    does: "Checks that the token list follows the grammar (context-free grammar) and builds the parse tree and the AST, predicting each production from one token of lookahead.",
    model: "A deterministic PDA: finite control plus one stack, run as an LL(1) predictive parser (FIRST sets pick the production).",
    input: "tokens",
    output: "parse tree + AST",
    whyNeeded: "A DFA can't match nested brackets: to check (( … )) it must count unboundedly many open brackets, and a DFA with n states can't tell n+1 different depths apart (pigeonhole, formally the pumping lemma). Balanced nesting needs a stack.",
  },
  semantic: {
    title: "Phase 3 · Semantic Analysis",
    does: "Walks the AST with a symbol table: every name must be declared before use in a visible scope, and every operator must get operands of the right type.",
    model: "An algorithm, not a named automaton: a tree walk with a stack of scopes (the symbol table).",
    input: "AST",
    output: "annotated AST (types, resolved names) + symbol table",
    whyNeeded: "A PDA can't check \"declared before use\". Matching a use against an earlier declaration is the language { w c w }, which is not context-free, so no grammar or single-stack machine can enforce it.",
    sketch: [
      "L = { w c w | w ∈ {a,b}* }   (declaration w … use w)",
      "Pump s = aᵖbᵖ c aᵖbᵖ with s = uvxyz, |vxy| ≤ p, |vy| ≥ 1:",
      "If v or y contains c, uv²xy²z has two c's ∉ L.",
      "Else |vxy| ≤ p keeps v, y inside one w, or across c in bᵖ…aᵖ:",
      "pumping changes the two copies of w differently ∉ L.",
      "Hence L is not context-free: a PDA's stack pops the first w in reverse, so it can't compare w against itself in order.",
    ],
  },
  ir: {
    title: "Phase 4 · AST → Instructions",
    does: "Translates the checked tree into a flat list of stack-machine instructions (push, add, jump…), statement by statement, the code panel morphing into the IR panel.",
    model: "Syntax-directed translation: each production has a translation rule, applied bottom-up while walking the AST (with backpatching for jump targets).",
    input: "annotated AST",
    output: "IR instruction list per function",
    whyNeeded: "Phases 1–3 only recognize (accept or reject). A tree can't be executed directly by a simple machine; translation is a computable function from trees to linear code with explicit jumps.",
  },
  opt: {
    title: "Phase 5 · Control-Flow Graph + Optimize",
    does: "Splits the IR into basic blocks at leaders, links them into a control-flow graph, then rewrites until a fixpoint: constant folding, removing unreachable (dead) code.",
    model: "Graph algorithms: BFS reachability from the entry block and fixpoint iteration of rewrite rules.",
    input: "IR",
    output: "control-flow graph + optimized IR",
    whyNeeded: "A flat instruction list hides which code can follow which. Reasoning about \"can this ever run?\" needs the graph of possible jumps.",
    sketch: [
      "Rice's theorem: every non-trivial semantic property of programs is undecidable.",
      "\"Is this code ever executed?\" is such a property, so no optimizer can decide it exactly.",
      "So we remove only provably dead code: blocks unreachable in the graph, or behind a constant-false condition.",
    ],
  },
  bytecode: {
    title: "Phase 6 · Bytecode Emission",
    does: "Assembles the optimized IR into bytes: each instruction becomes an opcode byte plus an argument byte (wordcode), with constant and name tables and resolved jump offsets.",
    model: "A deterministic assembler: a total, computable function from IR to bytes (two passes: layout, then patch jump targets).",
    input: "optimized IR",
    output: "bytecode + constant table + name table",
    whyNeeded: "IR is a readable symbolic form; a machine needs a fixed binary encoding with numeric addresses instead of labels.",
  },
  vm: {
    title: "Phase 7 · Execution (VM)",
    does: "Runs the bytecode by fetch–decode–execute: read the byte at the program counter, pop operands off the operand stack, push the result, follow jumps and calls.",
    model: "A stack VM with an operand stack, a call-frame stack and unbounded integers, as powerful as a Turing machine.",
    input: "bytecode",
    output: "program output",
    whyNeeded: "Every phase so far only transformed the program. Actually computing needs unbounded memory: a PDA has one stack, but two stacks already simulate a Turing machine's tape.",
    sketch: [
      "Universal machine: the VM takes a program (bytecode) as data and simulates it, as a universal Turing machine does.",
      "Halting problem: no algorithm decides whether an arbitrary program halts.",
      "So the VM can't detect infinite loops in general; it enforces a step cap and says so when it hits it.",
    ],
  },
};
