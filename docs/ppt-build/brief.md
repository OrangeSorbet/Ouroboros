# Ouroboros — End-Sem deck brief

## 1. Direction

- **Topic:** Ouroboros, a step-by-step visualizer of a 7-phase compiler for the toy language Snek, framed through Theory of Computation.
- **Audience:** ToC faculty and classmates (end-semester evaluation). **Purpose:** show that every compiler phase is a machine from the Chomsky hierarchy, then hand over to the live demo.
- **Narrative:** the snake (7 phase circles on a ring) opens up, walks through each phase as a hero circle, and closes its tail at the end, the way a compiler turns source text into a machine that runs it.
- **Style:** *vivid gradient*: deep purple → plum background (`0B0120 → 2A0A4A → 4C0B45`, 135°), neon magenta `FF2E93`, violet `8B5CF6`, cyan `22D3EE`, amber `FBBF24`. Headings are Arial Black, body text is Segoe UI, code is Consolas. White text on dark backgrounds.
- **Viewer:** PowerPoint 365 / 2019+ (Morph). Other viewers show plain fades.

## 2. Outline (11 slides, one idea each)

| # | Type | One-sentence argument |
|---|---|---|
| 1 | Cover | Ouroboros: a compiler that shows its work. |
| 2 | Context | Snek is a toy language, but it goes through the same 7 phases as CPython, small enough to see every step. |
| 3 | Theory map | The phases climb the Chomsky hierarchy: DFA → PDA → decidable algorithms → Turing machine. |
| 4 | Phase 1 | Lexing: a DFA with longest match, no ε-moves and a DEAD trap turns characters into tokens. |
| 5 | Phase 2 | Parsing: a one-stack LL(1) PDA driven by a parse table checks tokens against the grammar. |
| 6 | Phase 3 | Semantic analysis: declarations and types are beyond context-free, so a scope stack walks the tree. |
| 7 | Phase 4 | IR: a post-order syntax-directed translation emits stack instructions. |
| 8 | Phase 5 | Optimize: a CFG plus folding and pruning to a fixpoint; only provably dead code goes (Rice). |
| 9 | Phase 6 | Bytecode: 2-byte wordcode, labels become relative jumps. |
| 10 | Phase 7 | VM: fetch–decode–execute; two stacks plus unbounded integers give Turing power, so halting is undecidable. |
| 11 | Closing | The snake eats its tail: source in, running machine out; now the live demo. |

## 3. Morph pair planning

Scene actors (on every slide, morph-paired by name):

- `!!scene-orb1`, `!!scene-orb2`: soft glowing light blobs that drift every slide.
- `!!scene-ring`: gradient block-arc (a ring with a gap, the snake), which rotates and re-centres every slide.
- `!!scene-p1` … `!!scene-p7`: the 7 phase circles.

Per-slide content is named `#sN-*`. Every slide is built fresh, so `#sN-*` has no counterpart on slide N+1 and fades out (unpaired exit). No `!!actor-*` shapes are used, so nothing can accumulate as a ghost.

| Pair | Slide A | Slide B | Actors in play | Ghost on B |
|---|---|---|---|---|
| 1→2 | Ring of 7 circles (d 2.4) on the right, around the title | Ring shrinks into a small badge in the top-right; circles d 1.0 | ring, p1–p7, orbs | `#s1-*` fades |
| 2→3 | Top-right badge | Circles drop into a vertical ladder on the left, coloured by language class; ring moves to the bottom-right | ring, p1–p7, orbs | `#s2-*` fades |
| 3→4 | Ladder | p1 grows into the hero (d 9) on the left, ring wraps it; p2–p7 line up in a progress strip | ring, p1–p7, orbs | `#s3-*` fades |
| k→k+1 (4…9) | Hero = phase k | Phase k shrinks back into the strip (turns magenta = done); phase k+1 grows into the hero; ring rotates +40° | ring, p(k), p(k+1), orbs | `#sN-*` fades |
| 10→11 | Hero = phase 7 | All 7 circles re-form the ring (all done) around the closing text; the ring closes | ring, p1–p7, orbs | `#s10-*` fades |

Every pair moves ≥ 3 named shapes by ≥ 5 cm, ≥ 15° or ≥ 30 % in size (ring, orbs, and at least two circles).
