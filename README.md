<p align="center">
  <img src="public/orblogo.png" alt="Ouroboros logo" width="120" />
</p>

<h1 align="center">Ouroboros</h1>

<p align="center"><b>Watching a compiler think, one automaton at a time.</b><br/>
An interactive, step-by-step visualizer of a complete compiler — from raw characters to a running virtual machine — for the toy language <b>Ouroboros</b>.</p>

<p align="center">A Theory of Computation project (started as a course project) · Preact + TypeScript + Vite · runs entirely in the browser</p>

---

## Contents

1. [About the app](#1-about-the-app)
2. [Theory of Computation behind it](#2-theory-of-computation-behind-it)
3. [The Ouroboros language](#3-the-ouroboros-language)
4. [Phases of a compiler](#4-phases-of-a-compiler)
5. [Implementation, phase by phase](#5-implementation-phase-by-phase)
6. [Developer guide](#6-developer-guide)

---

## 1. About the app

**Ouroboros** takes a program written in the **Ouroboros language** (a small language made for this project, `.orbs` files) and pushes it through all seven phases of a real compiler pipeline — the same phases CPython goes through — while recording *every single step* each phase takes. You then play those steps back like a video.

**Naming:** *Ouroboros* is both the app and the language it compiles (`.orbs` files). The ouroboros — a snake eating its own tail — is the loop of a compiler: source text in, a machine that runs source text out.

### What you see

| Area | What it does |
|---|---|
| **Phase flowchart** | The home screen: 7 boxes, one per phase. Click a box to zoom into that phase. Boxes turn green when you've watched a phase to the end; a phase that failed turns red and every phase after it is shown as blocked. |
| **Phase view** (left) | The phase's own picture: a DFA graph, a PDA stack, an AST, a control-flow graph, bytecode tables, or the VM's stacks. |
| **Right panel** | The source code (editable), with the current step's characters highlighted. From phase 4 on it becomes the phase's output: IR, optimized IR with diffs, then a `dis`-style bytecode listing. |
| **Scrubber** (bottom) | Play / pause / step / drag through the trace, speed dial, chapter ticks (one per token, statement, code object…). |
| **2×2 explanation grid** | Every step explains itself in four cells: **What** happened · **Why** (the rule or theorem forcing it) · **Formal** (the δ entry, production, typing rule, translation rule…) · **Next**. |
| **Intro cards** | One per phase: what it does, its input and output, and which ToC machine it is. |
| **Glossary hovers** | Hover a ToC term (DFA, PDA, FIRST set, fixpoint…) for a short definition. |
| **Samples** | A dropdown with `demo.orbs` and one program per error kind (lexical, syntax, semantic, runtime, non-halting). You can also upload your own `.orbs` file or edit the code in place (Save / Ctrl+Enter recompiles). |

> 📸 **Screenshot — home screen (phase flowchart):** `docs/screenshots/home.png`
<!-- ![Home screen](docs/screenshots/home.png) -->

> 📸 **Screenshot — a phase view with scrubber and explanation grid:** `docs/screenshots/overview.png`
<!-- ![Phase view](docs/screenshots/overview.png) -->

### Design principles

- **Nothing is faked.** The pictures are drawn from the same data structures the compiler runs on (the DFA's δ table, the LL(1) table, the real CFG), so the screen can't disagree with the code.
- **Every step has a reason.** An empty "why" is treated as a bug.
- **Errors are first-class.** A failing phase still produces a playable trace up to the error, and the error step explains which rule was broken.

---

## 2. Theory of Computation behind it

The seven phases climb the **Chomsky hierarchy**. Each phase uses the weakest machine that can do its job, and each machine's limit is exactly why the next phase exists.

| Language class | Machine | Phase | What it can't do — forcing the next phase |
|---|---|---|---|
| Regular | **DFA** | 1 · Lexing | Can't match nested brackets `(( ))` — that needs unbounded memory. |
| Context-free | **PDA** (one stack) | 2 · Parsing | Can't check "declared before use" or types — that's like `{ w c w }`, which the pumping lemma proves is **not** context-free. |
| Context-sensitive properties | symbol table + tree walk | 3 · Semantic analysis | — |
| (translation, not recognition) | syntax-directed translation | 4 · IR generation | — |
| Decidable approximations of undecidable questions | graph algorithms (reachability, fixpoint iteration) | 5 · Optimization | Exact dead-code detection is undecidable (**Rice's theorem**), so only *provably* dead code is removed. |
| (encoding) | a total computable function | 6 · Bytecode | — |
| Recursively enumerable | **Turing machine** ≈ stack VM with unbounded memory | 7 · Execution | **Halting is undecidable**, so the VM runs on a step budget and says so. |

### Key ideas shown in the app

- **DFA without ε-moves, total δ.** The lexer is a real DFA — five-tuple *(Q, Σ, δ, q₀, F)* shown on screen. Every state has an edge for every character class; anything invalid goes to a `DEAD` trap state. "Accept a token and restart" is the scanner's action, not a fake ε-edge.
- **Longest match (maximal munch).** `<=` is one token, not `<` then `=`: the scanner keeps moving while δ allows it, then backs up to the last accepting state.
- **Why `123abc` is an error.** A number running straight into letters lands in the `BAD_NUMBER` state, just like real compilers report "invalid suffix on integer constant".
- **CFG → PDA.** The parser is the textbook one-state PDA built from a grammar: *expand* (pop a non-terminal, push a production's right side) and *match* (pop a terminal equal to the input).
- **LL(1).** FIRST and FOLLOW sets are computed by fixpoint iteration; the LL(1) table has at most one entry per cell, which is what makes the PDA **deterministic**. Left-factoring and left-recursion removal made the grammar LL(1).
- **Leftmost derivation, parse tree vs AST.** The parse tree is the *proof* that the input is in the language; the AST keeps only what later phases need, with left-associative operators folded back to the left.
- **Beyond context-free.** "Is `x` declared before use?" is the `{ w c w }` language — no PDA can check it, so semantic analysis uses a scope stack instead.
- **Rice's theorem.** Any non-trivial question about what a program *does* is undecidable. Type checking and dead-code elimination therefore check decidable *approximations*: types the literals make knowable (`unknown` otherwise); code with *no path* in the graph.
- **Fixpoints.** FIRST/FOLLOW, the optimizer's rewrite loop, and jump sizing in the assembler all repeat until nothing changes — and each provably terminates because something only grows or only shrinks.
- **Universal machine.** The VM takes the program as *data* and simulates it, as a universal Turing machine reads another machine's description.
- **Two stacks = Turing power.** One stack is a PDA; the VM has two (operand stack + call-frame stack) plus unbounded integers, so Ouroboros is **Turing-complete** — and therefore halting is undecidable. `err-halt.orbs` shows the step cap (10 000 instructions) tripping with that explanation.

---

## 3. The Ouroboros language

- **Values:** unbounded `int`, `float`, `bool`, `string`, `none`.
- **Collections** (snake-named): **coil** `[1, 2]` (list), **scale** `@(1, "a")` (immutable tuple), **den** `@{ "k": 1 }` (map), **clutch** `@[1, 2]` (set), with methods (`xs.push(3)`, `d.keys()`) and `for x in xs`.
- **Control flow:** `let`, `if/else`, `while`, C-style `for`, `for x in …`, `fn` / `return`, `print`, `&& || !`, `%`, built-ins `len` `str` `int` `float`.
- **Classes:** fields, methods, `self`, `new`, inheritance (`class Snake : Animal`), `super`, dynamic dispatch, `priv`, `abstract`, overloading by arity.
- `#` and `/* */` comments. Files use the `.orbs` extension.

```orbs
# demo.orbs
fn square(n) {
  return n * n;
}
let limit = 1 + 2;          /* folded to 3 in Phase 5 */
let total = 0;
for (let i = 0; i < limit; i = i + 1) {
  total = total + square(i);
}
let names = ["lo", "hi"];
if (total > 4 && !false) {
  print names[1];
} else {
  print total;
}
if (false) { print "never"; }   # removed as dead code
```

Output: `hi`

The full grammar (EBNF and the pure BNF the parser actually runs on), the
type rules, built-ins, collections and class rules are in
[`docs/ouroboros-grammar.md`](docs/ouroboros-grammar.md).

### Sample programs (`src/samples/`)

| File | Shows | Result |
|---|---|---|
| `demo.orbs` | functions, `for`, arrays, `&&`, dead code | prints `hi` |
| `arith.orbs` | precedence, left-associativity, `%`, unary minus, folding | all folded in Phase 5 |
| `floats.orbs` | int → float widening, `int()` / `float()` / `str()` | `0.1 + 0.2 == 0.3` is `false` |
| `scopes.orbs` | reassigning vs shadowing, `none` | inner `x` never touches the outer one |
| `loop.orbs` · `recursion.orbs` · `logic.orbs` | loops (CFG back-edges), the frame stack, short-circuit | |
| `coils.orbs` · `scales.orbs` · `dens.orbs` · `clutch.orbs` | the four collections, the heap, aliasing | |
| `classes.orbs` · `zoo.orbs` | fields, methods, inheritance, `super`, dynamic dispatch | |
| `bank.orbs` · `shapes.orbs` · `overload.orbs` | `priv`, `abstract`, overloading by arity | |
| `err-lex.orbs` | `123abc` | Phase 1 |
| `err-parse.orbs` | `let = 5;` | Phase 2 |
| `err-semantic.orbs` · `err-redeclare.orbs` · `err-scale-write.orbs` · `err-cycle.orbs` · `err-no-field.orbs` · `err-self.orbs` · `err-private.orbs` · `err-abstract-new.orbs` · `err-missing-impl.orbs` · `err-overload.orbs` | type error, `let` twice, writing a scale, inheritance cycle, unknown field, `self` outside a class, private access, `new` on an abstract class, missing override, duplicate overload | Phase 3 |
| `err-runtime.orbs` · `err-bad-key.orbs` · `err-recursion.orbs` · `err-halt.orbs` | `1 / 0`, missing den key, 256-frame cap, 10 000-step cap (halting problem) | Phase 7 |

---|---|---|
| `demo.orbs` | — | Runs all 7 phases, prints `hi`. |
| `err-lex.orbs` | Phase 1 | `123abc` — a number running into letters. |
| `err-parse.orbs` | Phase 2 | `let = 5;` — the LL(1) table has no entry for `let` followed by `=`. |
| `err-semantic.orbs` | Phase 3 | `x + true` — no typing rule for `int + bool`. |
| `err-runtime.orbs` | Phase 7 | `1 / 0` — division by zero (the optimizer deliberately never folds it). |
| `err-halt.orbs` | Phase 7 | `while (true)` — step cap reached; halting problem. |

---

## 4. Phases of a compiler

A compiler is a chain of translations. Each phase reads the previous phase's output and hands a more machine-like form to the next:

```
source text ─► 1 Lexing ─► tokens ─► 2 Parsing ─► AST ─► 3 Semantic analysis ─► typed AST + symbol table
            ─► 4 IR generation ─► stack instructions ─► 5 CFG + optimize ─► smaller instructions
            ─► 6 Bytecode ─► bytes ─► 7 VM ─► output
```

| # | Phase | Input → Output | Question it answers |
|---|---|---|---|
| 1 | **Lexical analysis** | characters → tokens | Which characters group into words? |
| 2 | **Syntax analysis** | tokens → parse tree → AST | Do the words form a valid sentence of the grammar? |
| 3 | **Semantic analysis** | AST → types, scopes, slots | Does the sentence make sense (declared names, matching types)? |
| 4 | **IR generation** | AST → stack-machine instructions | How is it computed, step by step? |
| 5 | **Control-flow graph + optimization** | IR → smaller IR | What can be computed now, or never runs? |
| 6 | **Bytecode emission** | IR → bytes + tables | How is it packed into numbers a machine reads? |
| 7 | **Execution (VM)** | bytes → output | What does it actually do? |

Ouroboros mirrors **CPython**: CPython also tokenizes, parses to an AST, compiles to stack bytecode via a control-flow graph with peephole optimizations, emits 2-byte "wordcode", and runs it on a stack VM (`dis` shows it). Ouroboros is small enough that every state, rule and instruction fits on one screen.

---

## 5. Implementation, phase by phase

Every phase is a pure function in `src/compiler/` returning `{ ok, trace, chapters, error?, output? }`. It never throws — on error it returns the trace up to the failing step. Each trace step carries its 2×2 explanation. The prose itself lives in `src/compiler/messages/`, separate from the logic.

### Phase 1 — Lexical analysis (DFA)

- **Engine:** `dfa.ts` holds the automaton as pure data — states *Q*, character classes *Σ*, the transition function *δ*, start state and accepting states. `lexer.ts` is the longest-match driver: run δ, remember the last accepting state, stop when the next move is `DEAD`, back up, emit the token, restart.
- **Handles:** keywords (identifier accepted, then looked up in the keyword table), `== != <= >= && ||`, strings, `#` and `/* */` comments, and the errors `BAD_NUMBER`, unterminated string / comment, and unknown characters.
- **View:** input tape with the read head, the DFA graph with the active state and edge lit, the full δ table with the current cell highlighted, the 5-tuple, and the token list growing.
- **Trace:** one step per δ move, plus accept, keyword check, error and end-of-input steps; one chapter per token.

> 📸 **Screenshot — Phase 1 (DFA, input tape, δ table):** `docs/screenshots/phase1-lex.png`
<!-- ![Phase 1](docs/screenshots/phase1-lex.png) -->

### Phase 2 — Syntax analysis (LL(1) PDA)

- **Engine:** `grammar.ts` is the grammar as data (pure BNF) — the single source of truth. `ll1.ts` computes FIRST, FOLLOW and the parse table *M* by fixpoint iteration and checks for conflicts. `parser.ts` is the table-driven PDA (expand / match) that also builds the parse tree. `astBuilder.ts` turns it into the AST, folding operators left-associatively. `callGraph.ts` derives the rule call graph from the same grammar.
- **View:** the PDA configuration (stack, remaining input), a leftmost-derivation strip, and tabs for the parse tree / AST, the LL(1) table with the used cell highlighted, the call graph, and the grammar.
- **Errors:** on a missing table entry the parser reports the expected set (FIRST of what it wanted).

> 📸 **Screenshot — Phase 2 (PDA stack, derivation, LL(1) table):** `docs/screenshots/phase2-parse.png`
<!-- ![Phase 2](docs/screenshots/phase2-parse.png) -->

### Phase 3 — Semantic analysis

- **Engine:** `semantic.ts` makes two passes: first it hoists every function name and arity (so functions can be called before they're defined), then walks the AST depth-first with a **stack of scopes** (the symbol table), resolving every name to a slot and typing every expression. Types: `int`, `float`, `bool`, `string`, `none`, `coil<T>`, `scale<…>`, `den<K, V>`, `clutch<T>`, class types, and `unknown` (for function parameters — Ouroboros has no annotations, so the VM checks those at run time). Classes are hoisted too; the inheritance graph must be acyclic.
- **Catches:** undeclared or duplicate names, type mismatches, non-bool conditions, wrong argument counts, assigning to non-lvalues, `return` outside a function, unhashable keys, writing to a scale, unknown fields/methods, inheritance cycles, private access, `new` on an abstract class, missing overrides.
- **View:** the AST with type badges filling in, and the scope stack pushing and popping.

> 📸 **Screenshot — Phase 3 (typed AST, scope stack):** `docs/screenshots/phase3-semantic.png`
<!-- ![Phase 3](docs/screenshots/phase3-semantic.png) -->

### Phase 4 — AST → instructions (IR)

- **Engine:** `irgen.ts` is a syntax-directed translation — one rule per AST node kind, applied in post-order so operands are pushed before the operator that pops them. Output: one CPython-style code object per function plus `<main>` (constants, names, slots, instructions). `for` loops are desugared to `while`. Forward jumps are emitted as `→ ?` and **backpatched** when their label is placed.
- **View:** the AST being walked (active / done nodes). The right panel splits: source on top, the growing instruction list below.

> 📸 **Screenshot — Phase 4 (AST walk, source → IR panel):** `docs/screenshots/phase4-ir.png`
<!-- ![Phase 4](docs/screenshots/phase4-ir.png) -->

### Phase 5 — Control-flow graph + optimization

- **Engine:** `optimize.ts` finds **leaders**, cuts the code into **basic blocks**, adds edges (true / false / fall-through / back-edges), then runs the rewrite rules to a **fixpoint**: constant folding, constant propagation, branch folding, dead-code elimination (unreachable blocks) and peephole cleanups. `1 / 0` is never folded — that error must happen at run time.
- **On the demo:** `1 + 2` becomes `3`, the `if (false)` block disappears, `<main>` shrinks from 47 to 40 instructions — and the output is unchanged.
- **View:** the CFG with blocks and coloured edges; the right panel shows the IR grouped by block with each rewrite as a diff. A Rice's-theorem note explains why only *provably* dead code is removed.

> 📸 **Screenshot — Phase 5 (CFG, IR diff):** `docs/screenshots/phase5-opt.png`
<!-- ![Phase 5](docs/screenshots/phase5-opt.png) -->

### Phase 6 — Bytecode emission

- **Engine:** `bytecode.ts` assembles each code object into **2-byte wordcode** (opcode byte + argument byte), like CPython 3.12. Labels become **relative** jump offsets in instruction units; arguments above 255 get `EXTENDED_ARG` prefixes. Because a prefix makes a jump longer, which can push other jumps further, sizes are recomputed until nothing grows (a fixpoint). It also builds `co_consts`, `co_names`, `co_varnames` and a line table. Opcode numbers are Ouroboros's own table (e.g. `POP_JUMP_IF_FALSE` = `0x2C`).
- **View:** the three tables filling in, the jump-sizing passes, labels → offsets, and each instruction's encoding (`IR ⟶ opcode, arg ⟶ bytes`). The right panel is a `dis`-style listing (line, offset, opname, arg, resolved value) with the hex bytes under every row.

> 📸 **Screenshot — Phase 6 (tables, encoding, dis listing):** `docs/screenshots/phase6-bytecode.png`
<!-- ![Phase 6](docs/screenshots/phase6-bytecode.png) -->

### Phase 7 — Execution (virtual machine)

- **Engine:** `vm.ts` is a fetch–decode–execute loop over the raw bytes: read the opcode at the program counter, fold in any `EXTENDED_ARG`s, pop operands, push results, follow jumps, push/pop call frames. Values: unbounded integers, floats, booleans, strings, `none`, and references to heap objects (coils, scales, dens, clutches, objects). Method calls on objects use **dynamic dispatch** — the VM walks the class chain, and the step says which class supplied the method.
- **Run-time errors:** division by zero, index out of range, missing den key, type errors on `unknown` operands, computing with `none`, private access through an `unknown` value, **step cap** (10 000 instructions — the halting problem) and **frame cap** (256 — unbounded recursion).
- **View:** the executed instruction, operand stack, call-frame stack, the top frame's locals, the **heap** (objects the instruction touched are outlined) and the console. The right panel is the `dis` listing with the program counter highlighted. Chapters follow source lines.

> 📸 **Screenshot — Phase 7 (VM stacks, console, PC):** `docs/screenshots/phase7-vm.png`
<!-- ![Phase 7](docs/screenshots/phase7-vm.png) -->

> 📸 **Screenshot — an error phase (red box, blocked phases):** `docs/screenshots/error.png`
<!-- ![Error](docs/screenshots/error.png) -->

---

## 6. Developer guide

### Requirements

- **Node.js 24+** (the self-check scripts run `.ts` files directly with Node's built-in type stripping)
- A modern browser (Chrome, Edge, Firefox)

### Setup

```bash
git clone https://github.com/OrangeSorbet/Ouroboros.git
cd Ouroboros
npm install
```

### Run

```bash
npm run dev        # dev server with hot reload — open the printed URL
npm run build      # typecheck (tsc -b) + production build into dist/
npm run preview    # serve the production build locally
```

### Self-checks

No test framework — each phase has one assert-based script that runs it on the samples and fails loudly if its logic breaks:

```bash
node scripts/check-lex.ts
node scripts/check-parse.ts       # also fails if the grammar stops being LL(1)
node scripts/check-semantic.ts
node scripts/check-ir.ts
node scripts/check-opt.ts         # runs the program before and after optimizing; output must match
node scripts/check-bytecode.ts
node scripts/check-vm.ts          # every sample runs or fails in the right phase
```

Run any program from the command line:

```bash
node scripts/run.ts src/samples/zoo.orbs
node scripts/run.ts -e 'print 1 + 2;'
```

### Project layout

```
src/
  compiler/            the compiler — pure TypeScript, no UI
    trace.ts           shared step/result types every phase uses
    pipeline.ts        compile(source): runs the 7 phases, stops at the first error
    dfa.ts lexer.ts tokens.ts                        phase 1
    grammar.ts ll1.ts parser.ts astBuilder.ts ast.ts callGraph.ts   phase 2
    semantic.ts semanticTypes.ts                     phase 3
    irgen.ts irTypes.ts                              phase 4
    optimize.ts                                      phase 5
    bytecode.ts                                      phase 6
    vm.ts heap.ts                                    phase 7 (heap.ts: run-time collections and objects)
    values.ts          value semantics shared by the optimizer and the VM (arithmetic, ==, built-ins)
    messages/          all explanation text (one file per phase + intro + glossary)
  components/          UI — one folder per phase (lex/ parse/ semantic/ ir/ opt/ bytecode/ vm/)
    graph/ElkGraph.tsx graph layout (elkjs in a Web Worker)
    PhaseFlowchart, Scrubber, ExplanationGrid, IntroCard, CodePanel, Navbar …
  samples/             demo.orbs, feature demos, and one sample per error kind
  hooks/useMedia.ts    phone breakpoint (the layout itself is CSS in styles/layout.css)
  styles/              colour and font tokens, responsive layout
scripts/               the per-phase self-checks, and run.ts
docs/                  plan, grammar, rules, presentation kit
```

### Extending the language

Add a construct by walking the pipeline in order: `dfa.ts` / `tokens.ts` → `grammar.ts` (run `check-parse` — it catches LL(1) conflicts) → `ast.ts` + `astBuilder.ts` → `semantic.ts` → `irgen.ts` (+ opcode in `irTypes.ts`) → `bytecode.ts` `OPCODE_NUM` → `vm.ts` → the matching `messages/*.ts` → `docs/ouroboros-grammar.md`. Then run all seven checks.

### Docs

| File | What |
|---|---|
| [`docs/features.md`](docs/features.md) | Every feature of the language, compiler, app and tooling in one list |
| [`docs/phase34plan.md`](docs/phase34plan.md) | Master design: every decision and why |
| [`docs/ouroboros-grammar.md`](docs/ouroboros-grammar.md) | Full Ouroboros grammar (EBNF + pure BNF) |
| [`docs/compiler-phases.md`](docs/compiler-phases.md) | Real compiler pipelines mapped to ToC |
| [`docs/ppt.md`](docs/ppt.md) | Presentation kit |
| [`docs/rules.md`](docs/rules.md) | Contributor rules |
