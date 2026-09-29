# Build progress — resume note

Read this first when resuming (new session, after context compaction, or
after a usage reset). Spec: `docs/phase34plan.md`. Agent rules/contracts/file
ownership: `docs/agent-brief.md`. Project rules: `docs/rules.md` (no npm/npx,
no git, no worktrees).

Last updated: 2026-09-29.

## Status by piece

| Piece | Status | Where |
|---|---|---|
| Contracts (trace, tokens, AST, semanticTypes, irTypes, graph types) | done | `src/compiler/trace.ts`, `tokens.ts`, `ast.ts`, `semanticTypes.ts`, `irTypes.ts`, `src/components/graph/types.ts` |
| Samples | done | `src/samples/demo.orbs` + `err-*.orbs` |
| `messages.ts` split (verbatim) | done | `src/compiler/messages/` |
| Phase 1 Lexer (engine + LexView) | **done**, check passes | `dfa.ts`, `lexer.ts`, `messages/lex.ts`, `src/components/lex/`, `scripts/check-lex.ts` |
| Phase 2 Parser (grammar, LL(1), PDA, AST builder, ParseView) | **done**, check passes | `grammar.ts`, `ll1.ts`, `parser.ts`, `astBuilder.ts`, `callGraph.ts`, `src/components/parse/` |
| Phase 3 Semantic (engine + SemanticView) | **done**, check passes on real lex+parse | `semantic.ts`, `messages/semantic.ts`, `src/components/semantic/` |
| UI shell (ElkGraph, ExplanationGrid, Scrubber, IntroCard, glossary, 7-box flowchart, samples dropdown) | **done** | `src/components/graph/ElkGraph.tsx`, etc. |
| Phase 4 IR generation (engine + IrGenView + IrConversionPanel) | **done**, check passes | `irgen.ts`, `messages/ir.ts`, `src/components/ir/`, `scripts/check-ir.ts` |
| Phase 5 CFG + optimizer (engine + OptView + OptPanel) | **done**, check passes (IR interpreter: demo prints `hi` before and after; `1 + 2` → 3, `if (false)` removed, `1 / 0` not folded) | `optimize.ts`, `messages/opt.ts`, `src/components/opt/`, `scripts/check-opt.ts` |
| Pipeline | done for all 7 phases | `src/compiler/pipeline.ts` (`IMPLEMENTED_PHASES`) |
| `app.tsx` integration | **done** — tsc clean, vite build passes, all 7 checks pass; right panel switches to IrConversionPanel / OptPanel / DisPanel on phases 4–7. Not yet eyeballed in a browser. | `src/app.tsx` |
| Phase 6 Bytecode (engine + AsmView + DisPanel) | **done**, check passes (11 fixtures) | `bytecode.ts`, `messages/bytecode.ts`, `src/components/bytecode/`, `scripts/check-bytecode.ts` |
| Phase 7 VM (engine + VmView + DisPanel) | **done**, check passes (demo prints `hi`; err-runtime = division by zero; err-halt = step cap / halting problem) | `vm.ts`, `messages/vm.ts`, `src/components/vm/`, `scripts/check-vm.ts` |
| Rename Snek → Ouroboros (`.orbs`) | **done** | everywhere except the finished deck (`docs/ppt*`, Canva) |
| Roadmap M5 responsive UI | **done** (headless-Chrome checked at 360/390/768/1440) | `styles/layout.css`, `hooks/useMedia.ts` |
| Roadmap M1 floats, `%`, `none`, built-ins | **done** | `values.ts` |
| Roadmap M2 coil / scale / den / clutch, for-each, heap panel | **done** | `heap.ts`, `components/vm/VmView.tsx` |
| Roadmap M3 classes, inheritance, dynamic dispatch | **done** | `semantic.ts`, `vm.ts` |
| Roadmap M4 `priv`, `abstract`, overloading by arity | **done** | `semantic.ts`, `vm.ts` |

Details and deviations per milestone: `docs/roadmap.md`. 32 samples in
`src/samples/`; `check-vm` runs all of them.

## Next steps, in order
1. Eyeball the new samples in a real browser (phones too) — the headless
   screenshots covered lex/parse/semantic/CFG/VM on a few samples only.
2. The deck quotes old numbers (demo PDA moves 559 → now 560 because
   `for` was left-factored for for-each). Refresh if the deck is reused.
3. Ideas not planned yet: interfaces, closures / first-class functions,
   folding constant scales in Phase 5, a collapsible scrubber for
   landscape phones.
