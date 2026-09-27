# Ouroboros build — shared brief for all implementation agents

Repo: `C:\Users\ashvi\Documents\VS_Codes\HTML\Snek` (Preact + TypeScript + Vite, client-only).
Deadline is tomorrow. Six agents work IN PARALLEL in the same folder, each owning
disjoint files. Read this whole brief, then `docs/phase34plan.md` (the approved
spec — sections named in your task), then `CLAUDE.md` and `docs/rules.md`.

## Hard rules (from docs/rules.md — violating these is a failure)
- **Never run npm or npx** (no install/run/exec). **Never touch git.** Never create worktrees. Never read `tooldata/`.
- Typecheck: `node node_modules/typescript/bin/tsc -b --force` (from repo root). Other agents' files and `src/app.tsx` may show errors while everyone is mid-work — you only need YOUR files error-free. Do not edit files you don't own to silence errors; report them instead.
- **Do not edit `src/app.tsx`** — the coordinator integrates all views at the end.
- Do not edit `src/styles/colors.ts`, `src/styles/fonts.ts`, `src/compiler/trace.ts`, `tokens.ts`, `ast.ts`, `semanticTypes.ts`, `irTypes.ts`, `src/components/graph/types.ts` (the contracts). If a contract truly blocks you, say so in your final report and work around it locally.
- Style: match surrounding code (comment density: explain *why*, not what). No `enum` (erasableSyntaxOnly — use `as const` objects + derived union types like tokens.ts). No placeholder/dummy code, no TODOs. Colours only via `colors.*`, fonts via `fonts.*` (inline styles, like existing components).
- **Compiler files (`src/compiler/**`) import each other with explicit `.ts` extensions** (`import { lex } from "./lexer.ts"`), and use only erasable TS syntax, so they run under plain `node` (v24, type stripping). Components may import extensionless like today.
- **All human-readable prose lives in `src/compiler/messages/<file>.ts`** (you own your phase's file). Engines produce raw steps; a `describe…`/builder in the messages file produces the `Explanation`. When reusing existing text from `messages/lex.ts` or `messages/parse.ts`, move it verbatim.
- Pedagogy (rules.md): every step explains **why in ToC terms**, not just what. Each `Explanation` cell ≤ ~160 chars, all four cells filled (`what`, `why`, `formal`, `next`). Formal cell cites the exact δ entry / production / LL(1) cell / typing rule / translation rule / optimization rule. If the visualization simplifies theory, the Why cell says so.
- One runnable self-check per engine: `scripts/check-<phase>.ts`, assert-based (`node:assert/strict`), runnable with `node scripts/check-<phase>.ts`, exercising `src/samples/*.snek` (read with `node:fs`). No test framework. Keep it small.

## Contracts (already written — read them)
- `src/compiler/trace.ts` — `PhaseId`, `Span`, `Explanation`, `TraceStep`, `Chapter`, `PhaseError`, `PhaseResult<TStep, TOutput>`. **Phases never throw**: on error return `ok:false`, the partial trace up to and including an error step (explain filled), and `error`.
- `src/compiler/tokens.ts` — extended `TokenKind`, `KEYWORDS`, `Token {kind, lexeme, value?, line, col, endCol}`.
- `src/compiler/ast.ts` — extended AST; every node has `id` (program-unique number) and `span`.
- `src/compiler/semanticTypes.ts` — `SnekType`, `Resolution`, `SemanticInfo` (phase 3 → 4).
- `src/compiler/irTypes.ts` — opcodes, `IrInstr`, `CodeObject`, `IrProgram`, `formatInstr` (phase 4 → 5 → 6).
- `src/components/graph/types.ts` — `<ElkGraph>` props (built by the shell agent at `src/components/graph/ElkGraph.tsx`, `export function ElkGraph(props: ElkGraphProps)`). Phase agents code against this API even before it exists; do not build your own graph renderer.
- Samples: `src/samples/demo.snek` (must pass all 7 phases; prints `hi`), `err-lex.snek` (lexical error: `123abc`), `err-parse.snek` (syntax error), `err-semantic.snek` (type error `x + true`), `err-runtime.snek` (divide by zero at run time — must pass phases 1–6), `err-halt.snek` (infinite loop — step cap in the VM).

## Engine function signatures (the coordinator wires exactly these)
| Phase | File (owner) | Function |
|---|---|---|
| 1 lex | `src/compiler/lexer.ts` (A) | `lex(source: string): PhaseResult<DfaStep, Token[]>` (tokens end with EOF) |
| 2 parse | `src/compiler/parser.ts` (B) | `parse(tokens: Token[]): PhaseResult<PdaStep, ParseOutput>`; `ParseOutput { tree: ParseNode; ast: Program }` |
| 3 semantic | `src/compiler/semantic.ts` (C) | `analyze(ast: Program): PhaseResult<SemStep, SemanticInfo>` |
| 4 ir | `src/compiler/irgen.ts` (D1) | `generate(ast: Program, sem: SemanticInfo): PhaseResult<IrGenStep, IrProgram>` |
| 5 opt | `src/compiler/optimize.ts` (D1) | `optimize(ir: IrProgram): PhaseResult<OptStep, OptOutput>`; `OptOutput` must include `program: IrProgram` (optimized) |
| 6 bytecode | `src/compiler/bytecode.ts` (D2) | `assemble(ir: IrProgram): PhaseResult<AsmStep, BytecodeProgram>` |
| 7 vm | `src/compiler/vm.ts` (D2) | `run(bc: BytecodeProgram): PhaseResult<VmStep, VmOutput>`; `VmOutput { output: string[] }` |

Every step type extends `TraceStep` (so it has `explain` and optional `span`). Set `span` in phases 1–4 whenever a source location exists (the right-hand code panel highlights it).

**Chapters:** phase 1 one per token (whitespace/comments included); phases 2–7 one per top-level item (statement or function) — label like `let limit`, `fn square`, `for`, `if`.

## View components (the coordinator mounts exactly these)
The left pane gives each view a box **between the navbar and the scrubber** (`position: relative`, `width/height: 100%`) — fill it (`position:absolute; inset:0` or flex), no navbar/scrubber offsets of your own, and never overflow it (internal scroll only). Typical box: ~1000–1400 × ~560 px (laptop). Dark theme, dense, minimal padding, monospace for machine content. Current step = `result.trace[index]`.

| Phase | Left view (owner) | Right-hand panel |
|---|---|---|
| 1 | `src/components/lex/LexView.tsx` → `LexView({ result, index, source })` (A) | code panel (coordinator) |
| 2 | `src/components/parse/ParseView.tsx` → `ParseView({ result, index, tokens })` (B) | code panel |
| 3 | `src/components/semantic/SemanticView.tsx` → `SemanticView({ result, index, ast })` (C) | code panel |
| 4 | `src/components/ir/IrGenView.tsx` → `IrGenView({ result, index, ast })` (D1) | `src/components/ir/IrConversionPanel.tsx` → `IrConversionPanel({ result, index, source })` (D1) |
| 5 | `src/components/opt/OptView.tsx` → `OptView({ result, index })` (D1) | `src/components/opt/OptPanel.tsx` → `OptPanel({ result, index })` (D1) |
| 6 | `src/components/bytecode/AsmView.tsx` → `AsmView({ result, index })` (D2) | `src/components/bytecode/DisPanel.tsx` → `DisPanel({ result, index })` (D2) |
| 7 | `src/components/vm/VmView.tsx` → `VmView({ result, index })` (D2) | `src/components/vm/VmCodePanel.tsx` → `VmCodePanel({ result, index })` (D2) |

`result` is the phase's full `PhaseResult` (possibly `ok:false` with partial trace — render the error step clearly in `colors.error`). `index` is always a valid trace index (the coordinator guards empty traces). Right-hand panels are ~420 px wide, full height, dark panel style like `CodePanel.tsx`.

The 2×2 explanation grid, scrubber, intro cards, glossary, flowchart, navbar belong to the shell agent — phase views do NOT render explanations themselves.

## File ownership
- **A (lexer):** `src/compiler/dfa.ts`, `lexer.ts`, `messages/lex.ts`, `src/components/lex/**`, `scripts/check-lex.ts`. May delete `src/components/DfaGraph.tsx`, `TransitionTable.tsx`, `TokenStream.tsx` once replaced.
- **B (parser):** `src/compiler/grammar.ts`, `ll1.ts`, `parser.ts`, `astBuilder.ts`, `callGraph.ts`, `messages/parse.ts`, `src/components/parse/**`, `scripts/check-parse.ts`, `docs/snek-grammar.md`. May delete `src/compiler/pda.ts`, `src/components/PdaGraph.tsx`, `PdaTransitionTable.tsx`, `PdaStackView.tsx`, `ParserTokenPanel.tsx`, `scripts/test-parser.ts`.
- **C (semantic):** `src/compiler/semantic.ts`, `messages/semantic.ts`, `src/components/semantic/**`, `scripts/check-semantic.ts`.
- **D1 (IR + optimizer):** `src/compiler/irgen.ts`, `optimize.ts`, `messages/ir.ts`, `messages/opt.ts`, `src/components/ir/**`, `src/components/opt/**`, `scripts/check-ir.ts`, `scripts/check-opt.ts`.
- **D2 (bytecode + VM):** `src/compiler/bytecode.ts`, `vm.ts`, `messages/bytecode.ts`, `messages/vm.ts`, `src/components/bytecode/**`, `src/components/vm/**`, `scripts/check-bytecode.ts`, `scripts/check-vm.ts`.
- **S (UI shell):** `src/components/graph/ElkGraph.tsx` (+ helpers in `src/components/graph/`), `src/components/ExplanationGrid.tsx`, `IntroCard.tsx`, `Scrubber.tsx`, `StepSlider.tsx`, `PhaseFlowchart.tsx`, `PhaseMinimap.tsx`, `Navbar.tsx`, `FileUpload.tsx`, `messages/intro.ts`, `messages/glossary.ts`, `src/styles/layout.css`.
- **Coordinator (not you):** `src/app.tsx`, `src/compiler/pipeline.ts`, `src/compiler/steps.ts` (to be deleted), `CodePanel.tsx`, `ZoomTransition.tsx`, contracts, docs other than those listed.

## Upstream availability
Agents run concurrently, so your upstream phase may not exist yet. For your self-check, first try the real upstream (`lex` → `parse` → `analyze` → …) — poll by checking whether the file exists and typechecks; if it isn't ready, build a minimal hand-made fixture of the upstream output in your check script so you are never blocked. Before finishing, re-run your check against the real upstream if it has appeared.

## Final report (keep it short)
Files created/changed/deleted; exported API (exact signatures + step type fields the view uses); what your self-check covers and its result; tsc status of your files; any contract problems or cross-agent issues.
