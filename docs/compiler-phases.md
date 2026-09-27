# Compiler Phases — Reference for Ouroboros (the Snek compiler)

Background doc for the course project + PPT. Explains real compiler pipelines, maps them to Theory of Computation (ToC) concepts, and states what Snek implements vs. gestures at.

## 1. CPython's real pipeline (5 stages)

Source per CPython's own internals (`Parser/`, `Python/compile.c`, `Python/flowgraph.c`, `Python/assemble.c`):

1. **Tokenize** — raw characters -> stream of tokens.
2. **Parse** — token stream -> AST, via a PEG parser (`Grammar/python.gram`).
3. **AST -> instruction sequence** — first linearization into pseudo-bytecode-ish instructions.
4. **Construct CFG + optimize** — build basic blocks, apply peephole/dead-code optimizations.
5. **Emit bytecode** — final `.pyc` bytecode the VM executes.

So: `source -> tokens -> AST -> instructions -> CFG (optimized) -> bytecode`.

## 2. Mapping to ToC concepts

| Real CPython stage | ToC concept | Weight for Snek |
|---|---|---|
| Tokenizer | DFA/NFA — regex to NFA to DFA, scanning chars into tokens | **High** — fully implement |
| Parser (PEG -> AST) | CFG (Context-Free Grammar) + PDA — derivation tree construction | **High** — fully implement |
| AST -> instructions | Not automata-driven, just tree-to-linear translation | Low — mention briefly |
| CFG construction + optimize | Optional tie to graph/decidability — constant folding is decidable, general optimization is undecidable (Rice's theorem callback) | Medium — symbolic/discussion only |
| Bytecode emission | Turing-machine-computable output, deterministic final transformation | Low — show happening, don't over-engineer |

## 3. Cross-language comparison

**C (GCC/Clang):**
1. Preprocessing (macro expansion, `#include`) — not ToC scope, text substitution
2. Lexical Analysis — tokens (DFA-based)
3. Syntax Analysis — AST (CFG/PDA-based)
4. Semantic Analysis — type checking, symbol tables
5. Intermediate Code Generation (GIMPLE, then RTL)
6. Optimization (on IR)
7. Code Generation — real machine code (assembly -> object file)
8. Linking — separate step, combines object files into executable

Key difference: C compiles ahead-of-time (AOT) all the way to native machine code. No bytecode, no VM.

**Java (javac + JVM):**
1. Lexical Analysis — tokens
2. Syntax Analysis — AST
3. Semantic Analysis — type checking
4. IR -> bytecode (`.class` file) — javac stops here
5. Runtime: JVM class loader -> bytecode verifier -> interpreter or JIT -> native code

**Python (CPython):** same shape as Java through bytecode (tokenize -> AST -> instructions -> CFG/optimize -> bytecode), but bytecode is interpreted by the CPython VM, not JIT-compiled to native by default.

**Universal skeleton** (every compiler textbook, Aho/Ullman "Dragon Book"): lex -> parse -> semantic check -> IR/optimize -> codegen. What differs across languages:
- Stops at bytecode (Python, Java) vs. goes to native machine code (C)
- Separate linking step (C: yes; Python/Java: no — resolved at import/class-load)
- Optimization aggressiveness (C ahead-of-time, Java JIT at runtime)

## 4. Snek's scope decision

Stick with the **Python/bytecode model**: stop at bytecode (then run it on a VM), no linking, no native codegen. Keeps scope sane, still hits every required ToC concept.

**Superseded detail:** this section originally planned Phases 3–5 as symbolic boxes only. The approved plan (`docs/phase34plan.md`) implements all of them for real, as **7 phases**: Lexical Analysis → Syntax Analysis → Semantic Analysis → AST → Instructions → Control-Flow Graph + Optimize → Bytecode Emission → Execution (VM). That file is the source of truth for scope, theory mapping, and UI.

- **Phase 1 (Lexer)** — DFA + longest-match scanner (`src/compiler/dfa.ts`, `src/compiler/lexer.ts`).
- **Phase 2 (Parser)** — context-free grammar + table-driven LL(1) PDA (`src/compiler/grammar.ts`, `ll1.ts`, `parser.ts`, `astBuilder.ts`, `src/compiler/ast.ts`).
- **Phases 3–7** — `semantic.ts`, `irgen.ts`, `optimize.ts`, `bytecode.ts`, `vm.ts` under `src/compiler/`.

## 5. Talking points for the PPT / viva

See `docs/ppt.md` (slides, speaker notes, likely viva questions) and `docs/phase34plan.md` §2 (the Chomsky-hierarchy map). Short version:

- Lexer = DFA: alphabet, states, transition function, accepting states -> demoable via `src/compiler/dfa.ts` and the DFA graph view.
- Parser = context-free grammar + PDA: grammar in `docs/snek-grammar.md`, PDA expand/match trace from `src/compiler/parser.ts`.
- Decidability angle: constant folding / peephole optimization is decidable; general program optimization (e.g., "is this dead code reachable") is undecidable — Rice's theorem callback for why Snek's optimizer is sound but incomplete.
- Every stage after parsing is real in CPython/Java/C but progressively less automata-theoretic, ending in a Turing-complete VM whose halting is undecidable.
