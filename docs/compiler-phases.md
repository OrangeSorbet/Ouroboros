# Compiler Phases — Reference for Snek

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

Stick with the **Python/bytecode model**: stop at bytecode, no linking, no native codegen. Keeps scope sane, still hits every required ToC concept.

- **Phase 1 (Lexer)** and **Phase 2 (Parser)** — full depth. Lexer = DFA (`src/dfa.ts`, `src/lexer.ts`), parser = CFG/PDA via recursive descent with explicit stack (`src/parser.ts`, `src/ast.ts`). These map directly to the syllabus and are the project's theoretical core.
- **Phases 3-5** (AST->instructions, CFG/optimize, bytecode emission) — lightweight/symbolic. Represented in the Phase 6 flowchart as boxes the animation passes through, without full implementation. Talking point: "this is as far as CPython goes too — no linking, no native codegen."

This is also why `docs/checklist.md` Phase 6 is titled "Multi-Phase Compiler Flowchart" — it's the zoomable view showing all 5 real stages as boxes, zooming into Phase 1/2 for the actual DFA/PDA animation, and passing through 3-5 symbolically before reaching a "bytecode" end state.

## 5. Talking points for the PPT / viva

- Lexer = DFA: alphabet, states, transition function, accepting states -> directly demoable via `src/dfa.ts` and the DFA graph view.
- Parser = CFG + PDA: grammar in `docs/snek-grammar.md`, PDA stack trace in `parser.ts`'s `enter()`/`exit()`.
- Decidability angle: constant folding / peephole optimization is decidable; general program optimization (e.g., "is this dead code reachable") is undecidable — good Rice's theorem callback if asked why Snek doesn't do full optimization.
- Every stage after parsing is real in CPython/Java/C but progressively less automata-theoretic — justifies why Snek's depth drops off after Phase 2.
