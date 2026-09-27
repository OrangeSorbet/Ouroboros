# Ouroboros — End-Sem deck brief

## 1. Direction

- **Topic:** Ouroboros, a step-by-step visualizer of a 7-phase compiler for the toy language Snek, framed through Theory of Computation.
- **Audience:** ToC faculty and classmates (formal end-semester presentation). **Purpose:** show where ToC lives in a compiler (heaviest in Phases 1–2), then hand over to the live demo.
- **Narrative:** the snake (7 phase circles on a ring) opens up, walks through each phase as a hero circle, and closes its tail at the end.
- **Style:** green-on-black terminal palette with the same layout, motion and fonts as before. Background `000000 → 03150A → 062A12` (135°). Neon green `00FF88`, deep green `0B8F45`, teal `5EEAD4`, amber `FBBF24` for warnings and limits. Text is mint-white `D1FAE5`, with dark text on bright fills. Headings are Arial Black, body text is Segoe UI, code is Consolas.
- **Viewer:** PowerPoint 365 / 2019+ (Morph).

## 2. Outline (18 slides)

| # | Section | One-sentence argument |
|---|---|---|
| 1 | Title | Ouroboros: visualizing a compiler through the Theory of Computation. |
| 2 | Introduction | Compilers are ToC's biggest application but are black boxes; we built one for Snek and replay every step. |
| 3 | Objectives | Four objectives: show the machines, build all 7 phases, explain every step, demonstrate the limits. |
| 4 | Theory | The Chomsky hierarchy: DFA → PDA → decidable algorithms → Turing machine, each limit forcing the next phase. |
| 5 | ToC in this project | Where the theory lives, per phase: heaviest in Phases 1–2 (automata), limits in 3/5/7, translation in 4/6. |
| 6 | System overview | 7 phases in one pipeline; the first failure stops it; every phase returns a replayable trace. |
| 7 | Phase 1: theory | The lexer is a real DFA: a 5-tuple as data, total δ with a DEAD trap, no ε-moves. |
| 8 | Phase 1: in action | Maximal munch (`<=`), keyword lookup, `123abc` → BAD_NUMBER; 94 tokens in 700 steps. |
| 9 | Phase 2: theory | Grammar as data (pure BNF), FIRST/FOLLOW fixpoint, the LL(1) table ⇒ a deterministic PDA. |
| 10 | Phase 2: in action | The PDA's expand/match moves on the stack, leftmost derivation; 559 moves. |
| 11 | Phase 3 | `{wcw}` is not context-free ⇒ a scope-stack symbol table; Rice ⇒ unknown types are checked at run time. |
| 12 | Phase 4 | Post-order syntax-directed translation to stack code, with backpatching. |
| 13 | Phase 5 | A CFG plus rewrites to a fixpoint; Rice ⇒ only provably dead code goes; 47 → 40 instructions. |
| 14 | Phase 6 | 2-byte wordcode, relative jumps, EXTENDED_ARG sizing fixpoint. |
| 15 | Phase 7 | A universal machine; two stacks + unbounded integers ⇒ Turing-complete ⇒ a step budget. |
| 16 | Results | 7/7 phases, 94·700, 559·0, 47→40, 6/6 samples, 7/7 checks. |
| 17 | Demo | The order of the live demo: demo.snek, then one error sample per phase. |
| 18 | Conclusion | Every phase is a machine; ToC is heaviest in Phases 1–2; future work: regex → NFA → DFA. |

## 3. Morph pair planning

Scene actors on every slide, paired by name: `!!scene-orb1`, `!!scene-orb2` (drifting glows), `!!scene-ring` (the snake: a gradient block arc whose mouth rotates) and `!!scene-p1`…`!!scene-p7` (the phase circles). Per-slide content is `#sN-*`. Every slide is built fresh, so content fades out unpaired; there are no `!!actor-*` shapes, so nothing can accumulate as a ghost.

| Pair | Circles go from → to |
|---|---|
| 1→2 | Big ring around the title → small badge in the top-right |
| 2→3 | Badge → a row in the top-right (the objectives header) |
| 3→4 | Row → a vertical ladder coloured by language class |
| 4→5 | Ladder → a column beside the ToC-weight bars |
| 5→6 | Column → a horizontal pipeline with arrows |
| 6→7 | Pipeline → phase 1 becomes the hero; the rest form a progress strip in the top-right |
| 7→8, 9→10 | The same hero shrinks and moves down for the "in action" slide |
| 8→9 … 14→15 | The hero hands over to the next phase; the finished phase turns solid green in the strip |
| 15→16 | Strip of 7 finished phases (results) |
| 16→17 | → a ring around the demo list |
| 17→18 | → the big closing ring; the snake's mouth closes (gap 2°) |

Every pair moves ≥ 3 named shapes (ring, both orbs, and circles).
