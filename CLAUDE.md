# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Ouroboros** — personal Theory of Computation project (started as a course project): an interactive visualizer of a whole toy compiler for its own language, also called **Ouroboros** (`.orbs` files; renamed from "Snek", which already exists as a language — never reintroduce that name). A `.orbs` program goes through 7 phases (lex → parse → semantic → IR → CFG/optimize → bytecode → VM); every phase records a step trace, and the UI plays each trace back with a scrubber, a 2×2 explanation grid (What / Why / Formal / Next) and a phase-specific view.

Preact + TypeScript + Vite. No backend — everything runs client-side.

Spec: `docs/phase34plan.md`. Rules: `docs/rules.md` (read first). Resume note: `docs/progress.md`. Roadmap (M1–M5, language + responsive): `docs/roadmap.md`. Feature list: `docs/features.md` (update it with every new feature).

## Rules (summary — `docs/rules.md` is canonical)

- **Never run npm/npx.** Never touch git, never create a worktree, never read `tooldata/`.
- All UI prose lives under `src/compiler/messages/`, not in engine or component code.

## Commands (node only)

- Typecheck: `node node_modules/typescript/bin/tsc -b --force`
- Build: `node node_modules/vite/bin/vite.js build`
- Dev server: `node node_modules/vite/bin/vite.js`
- Self-checks (assert-based, one per phase): `node scripts/check-{lex,parse,semantic,ir,opt,bytecode,vm}.ts`. Node 24 runs `.ts` directly, which is why compiler files import each other with explicit `.ts` extensions. `check-vm` also runs every sample and asserts where each `err-*` sample stops (add new ones to its `ERR_PHASE`).
- Run a program: `node scripts/run.ts src/samples/zoo.orbs` or `node scripts/run.ts -e 'print 1 + 2;'`.

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
| 7 | VM | `vm.ts` (fetch–decode–execute over raw bytes; operand + frame stacks + heap; step cap 10 000, frame cap 256) + `heap.ts` (collections, objects) | `messages/vm.ts` | `components/vm/VmView` | `DisPanel` (PC) |

`values.ts` holds the value semantics (arithmetic, `==`, built-ins) shared by the constant folder (phase 5) and the VM, so folding can never disagree with execution. Language features by milestone (floats/`none`/built-ins, coil/scale/den/clutch, classes, `priv`/`abstract`/overloading): `docs/roadmap.md`; the language reference is `docs/ouroboros-grammar.md`.

Other prose: `messages/intro.ts` (per-phase intro cards), `messages/glossary.ts` (ToC term hovers).

### UI — `src/app.tsx`, `src/components/`

- `app.tsx` owns all state: source, `PipelineResult`, one trace index per phase, current view, zoom. `renderLeftPane(view)` renders the flowchart or a phase view + back/intro buttons + scrubber; it's reused for the live render and both layers of `ZoomTransition` (confined to the left pane). The right panel is `CodePanel`, swapped for the phase's own panel on phases 4–7.
- Shell: `PhaseFlowchart` (7 boxes, enabled/completed/error states), `Scrubber` (+ `ExplanationGrid`), `IntroCard`, `Navbar`/`FileUpload` (samples dropdown from `src/samples/`), `CodePanel` (editable; recompiles on Save / Ctrl+Enter only).
- Graphs: `components/graph/ElkGraph.tsx` — elkjs layout in a Web Worker. Preact core ignores camelCase SVG attributes; use kebab-case (`stroke-width`).
- Styles: `styles/colors.ts` / `fonts.ts` tokens, referenced directly in inline styles.
- Responsive: components keep inline styles; `styles/layout.css` overrides them with `!important` via classes (`app-root`, `side-dock`, `rsp-row`/`rsp-side`, `rsp-grid3`) at ≤ 640 px (phone) and ≤ 1024 px portrait (stacked). `hooks/useMedia.ts` `PHONE` drives the few structural changes (flowchart column, explanation tabs, compact navbar).

### Extending the language

`dfa.ts` (+ `tokens.ts`) → `grammar.ts` (LL(1) conflicts are caught by `check-parse`) → `ast.ts` + `astBuilder.ts` (+ `components/semantic/astGraph.ts` children/label) → `semantic.ts` → `irgen.ts` (+ `irTypes.ts` opcode) → `bytecode.ts` `OPCODE_NUM` → `vm.ts` (+ `values.ts` / `heap.ts`) → matching `messages/*.ts` → `docs/ouroboros-grammar.md` (its BNF block is a copy of `grammar.ts`). Add a sample; run all seven checks after.

### Vite/React alias note

`vite.config.ts` aliases `react`/`react-dom` to `preact/compat`. `@xyflow/react` is still in `package.json` but no longer imported (graphs moved to elkjs).
