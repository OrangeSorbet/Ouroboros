# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Ouroboros** — Theory of Computation course project: an interactive visualizer of a whole toy compiler for the **Snek** language. (Ouroboros = the project/app name; Snek = the language, `.snek` files — never swap them.) A `.snek` program goes through 7 phases (lex → parse → semantic → IR → CFG/optimize → bytecode → VM); every phase records a step trace, and the UI plays each trace back with a scrubber, a 2×2 explanation grid (What / Why / Formal / Next) and a phase-specific view.

Preact + TypeScript + Vite. No backend — everything runs client-side.

Spec: `docs/phase34plan.md`. Rules: `docs/rules.md` (read first). Resume note: `docs/progress.md`.

## Rules (summary — `docs/rules.md` is canonical)

- **Never run npm/npx.** Never touch git, never create a worktree, never read `tooldata/`.
- All UI prose lives under `src/compiler/messages/`, not in engine or component code.

## Commands (node only)

- Typecheck: `node node_modules/typescript/bin/tsc -b --force`
- Build: `node node_modules/vite/bin/vite.js build`
- Dev server: `node node_modules/vite/bin/vite.js`
- Self-checks (assert-based, one per phase): `node scripts/check-{lex,parse,semantic,ir,opt,bytecode,vm}.ts`. Node 24 runs `.ts` directly, which is why compiler files import each other with explicit `.ts` extensions.

## Architecture

### Shared contract — `src/compiler/trace.ts`

Every phase is a pure function returning `PhaseResult<Step, Output>`: `{ ok, trace, chapters, error?, output? }`. A phase never throws; on error it returns the partial trace ending in an error step. Every step carries `explain: { what, why, formal, next }` (all four filled) and optionally a source `span`. `pipeline.ts` `compile(source)` runs the phases in order and stops at the first failure (`errorPhase`); later phases show as blocked.

### Phases — `src/compiler/`

| # | Phase | Engine | Prose | View (left) | Right panel |
|---|---|---|---|---|---|
| 1 | Lexing | `dfa.ts` (Q, Σ, δ, q₀, F as data — no ε-moves, total δ via DEAD) + `lexer.ts` (longest-match driver) | `messages/lex.ts` | `components/lex/` | `CodePanel` |
| 2 | Parsing | `grammar.ts` (pure BNF, single source of truth) → `ll1.ts` (FIRST/FOLLOW/M) → `parser.ts` (table-driven LL(1) PDA + parse tree) → `astBuilder.ts` (left-assoc fold); `callGraph.ts` derived view | `messages/parse.ts` | `components/parse/` | `CodePanel` |
| 3 | Semantic | `semantic.ts` (hoist pass + scope-stack walk, types, slots) → `semanticTypes.ts` | `messages/semantic.ts` | `components/semantic/` | `CodePanel` |
| 4 | AST → IR | `irgen.ts` (post-order syntax-directed translation, backpatching, `for` desugar) → `irTypes.ts` | `messages/ir.ts` | `components/ir/IrGenView` | `IrConversionPanel` |
| 5 | CFG + optimize | `optimize.ts` (leaders, blocks, edges; fold/propagate/branch-fold/DCE/peephole to fixpoint; never folds `1/0`) | `messages/opt.ts` | `components/opt/OptView` | `OptPanel` |
| 6 | Bytecode | `bytecode.ts` (2-byte wordcode, relative jumps, EXTENDED_ARG sizing fixpoint, co_consts/names/varnames, line table) | `messages/bytecode.ts` | `components/bytecode/AsmView` | `DisPanel` (growing) |
| 7 | VM | `vm.ts` (fetch–decode–execute over raw bytes; operand + frame stacks; step cap 10 000, frame cap 256) | `messages/vm.ts` | `components/vm/VmView` | `DisPanel` (PC) |

Other prose: `messages/intro.ts` (per-phase intro cards), `messages/glossary.ts` (ToC term hovers).

### UI — `src/app.tsx`, `src/components/`

- `app.tsx` owns all state: source, `PipelineResult`, one trace index per phase, current view, zoom. `renderLeftPane(view)` renders the flowchart or a phase view + back/intro buttons + scrubber; it's reused for the live render and both layers of `ZoomTransition` (confined to the left pane). The right panel is `CodePanel`, swapped for the phase's own panel on phases 4–7.
- Shell: `PhaseFlowchart` (7 boxes, enabled/completed/error states), `Scrubber` (+ `ExplanationGrid`), `IntroCard`, `Navbar`/`FileUpload` (samples dropdown from `src/samples/`), `CodePanel` (editable; recompiles on Save / Ctrl+Enter only).
- Graphs: `components/graph/ElkGraph.tsx` — elkjs layout in a Web Worker. Preact core ignores camelCase SVG attributes; use kebab-case (`stroke-width`).
- Styles: `styles/colors.ts` / `fonts.ts` tokens, referenced directly in inline styles.

### Extending the language

`dfa.ts` (+ `tokens.ts`) → `grammar.ts` (LL(1) conflicts are caught by `check-parse`) → `ast.ts` + `astBuilder.ts` → `semantic.ts` → `irgen.ts` (+ `irTypes.ts` opcode) → `bytecode.ts` `OPCODE_NUM` → `vm.ts` → matching `messages/*.ts` → `docs/snek-grammar.md`. Run all seven checks after.

### Vite/React alias note

`vite.config.ts` aliases `react`/`react-dom` to `preact/compat`. `@xyflow/react` is still in `package.json` but no longer imported (graphs moved to elkjs).
