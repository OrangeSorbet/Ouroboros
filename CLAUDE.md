# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Snek" — interactive visualizer for compiler front-end concepts (DFA-based lexing, recursive-descent parsing). It defines a small toy language, lexes/parses source through it, records every DFA transition and PDA push/pop as a step trace, and lets the user scrub through that trace in the UI (graph view, transition table, code panel with line highlighting).

Preact + TypeScript + Vite. No test framework, no backend — everything runs client-side in the browser.

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — typecheck (`tsc -b`) then production build
- `npm run preview` — preview a production build

No test suite or linter is configured. `src/test-parser.ts` is a manual scratch script, not a test runner entry point.

## Architecture

Pipeline: **lexer (DFA) → parser (PDA recursive descent) → step traces → UI playback**, rendered as a permanent split screen: a left pane that swaps between phase views (with a zoom transition confined to it) and a permanent right-hand `CodePanel` that's never touched by that transition.

All compiler logic lives under `src/compiler/`; all UI lives under `src/components/`.

### `src/compiler/`

- `dfa.ts` — the lexer's formal automaton: `State`, `TRANSITIONS` (delta function keyed by state + `CharClass`, including pseudo-classes `"epsilon"`/`"reject"` for the accept-and-restart / trap edges), `classify()`, `ACCEPTING` (states whose epsilon-edge emits a token — `IN_IDENT`, `IN_NUMBER`, and also `SAW_EQ`/`SAW_LT`/`SAW_GT`, which are equally accepting even though their emitted kind depends on whether a trailing `=` was also seen), `SINGLE_CHAR_TOKENS`. Source of truth for lexer behavior; `lexer.ts` just drives it.
- `tokens.ts` — `TokenKind`, `KEYWORDS`, `Token` (`{kind, lexeme, line, col}`).
- `lexer.ts` — drives the DFA character-by-character, producing `Token[]` plus a `DfaStep[]` trace (one entry per delta transition, including epsilon "emit" steps). Throws `LexError` (carries `partialTrace`) on dead states.
- `ast.ts` — one interface per CFG non-terminal/production alternative (statements: `let`/assign/`print`/`if`/`while`/block/expr-stmt; expressions via standard precedence climbing: equality → comparison → additive → multiplicative → unary → primary).
- `parser.ts` — recursive-descent `Parser`, one method per non-terminal. Tracks an explicit `stack: string[]`, modeling the parser as a PDA. Every trace event is a `PdaStep` with one of three actions:
  - `"push"`/`"pop"` — from `enter(symbol)`/`exit(symbol)`, wrapping every non-terminal method.
  - `"consume"` — from `expect(kind, context)` (checks + consumes) and `consumeToken(context)` (caller already checked via `check()`/`peek()`, e.g. an operator inside a `while` loop, a literal branch in `parsePrimary`'s switch). **Every** terminal token consumption goes through one of these two — a bare `this.advance()` anywhere in a grammar method is a bug, since it produces a token with no trace step (invisible to the code-pane highlight, token list, and description).
  - Each `PdaStep` carries `tokenIndex`/`tokenKind`/`tokenLexeme` (the lookahead at that instant) plus a full `stackAfter` snapshot. Throws `ParseError` on unexpected tokens.
- `pda.ts` — the parser's call graph treated as an actual PDA for the graph UI: `PDA_SYMBOLS` (15 non-terminals), `PDA_EDGES` (`{from, to, trigger, recurse?}` — `trigger` is the lookahead condition that selects that production, `recurse: true` marks a back-edge to an ancestor already on the stack, e.g. `Block→Statement`, `Primary→Equality`). `activePdaEdgeKey(step)` derives the exact edge a step traverses from `stackAfter` (parent = `stackAfter[len-2]` on push, `stackAfter[len-1]` on pop). Kept separate from `parser.ts` the same way `dfa.ts` is kept separate from `lexer.ts`.
- `messages.ts` — all UI prose, kept out of the automaton/parser logic: `GRAMMAR_RULES` (production text per non-terminal), `dfaMessages` (per-DfaStep narration), `pdaPlain` (per-non-terminal push/pop narration — pop text takes the actual `returnsTo` symbol so it never hardcodes a wrong "returns to X" claim), `pdaConsumeNote(rule, tokenKind)` (grammar-grounded "why this token, here" reasoning for `"consume"` steps, keyed by rule+kind since the same token kind means different things in different rules).
- `steps.ts` — `buildChapters()` (DFA trace → per-token chapters for the scrubber), `describeStep()` (DfaStep → prose), `describePdaStep()` (PdaStep → prose, always tagged with the literal action, e.g. `(PUSH Statement on 'let')` / `(POP LetStmt on 'x', returning control to Statement)`).

### `src/app.tsx` and `src/components/`

- `app.tsx` — owns all state (source, lex/parse traces + indices, `tokens: Token[]`, view/zoom state). `renderLeftPane(view)` renders one phase's canvas + navbar/scrubber/back-button chrome, used for both the live render and both layers of `ZoomTransition` — zoom is confined entirely to that pane. `CodePanel` is a single permanent sibling outside all of that, rendered once, never re-mounted by view changes.
- `DfaGraph.tsx` / `TransitionTable.tsx` / `TokenStream.tsx` — lexical-analysis view: React Flow automaton graph (custom `RoutedEdge` with hand-computed orthogonal paths through a lane-picked gutter, not bezier curves — guarantees edges never pass behind a node), delta table, emitted-tokens list.
- `PdaGraph.tsx` / `PdaTransitionTable.tsx` / `PdaStackView.tsx` / `ParserTokenPanel.tsx` — syntax-analysis view, split into a wider **theoretical** pane (the `pda.ts` call graph + its 5-column transition table: from/trigger/push/pop-to/kind) and a narrower **technical** pane (the parser's real `stack: string[]`, plus the full token list with the current lookahead highlighted). Same `RoutedEdge`-style routing as `DfaGraph`, with edge opacity baked into the stroke/marker color directly (CSS `opacity` doesn't dim an SVG marker, so a faded edge would otherwise keep a full-brightness arrowhead).
- `CodePanel.tsx` — editable (local `draft` state; typing doesn't recompile live — re-lexing a half-typed token mid-keystroke threw confusing errors, so it only recompiles on the Save button or Ctrl/Cmd+Enter), resizable (drag the left-edge strip), syntax-highlighted via a transparent `<textarea>` over a highlighted `<pre>`. `renderLine(line, activeStart?, activeEnd?)` highlights a token-length span (not just one character) by splitting whichever regex segment(s) overlap `[activeStart, activeEnd]`.
- `ZoomTransition.tsx` — `position: absolute` (not `fixed`), so it's confined to whichever pane's container it's mounted in and never covers the permanent `CodePanel`.
- `PhaseFlowchart.tsx` / `PhaseMinimap.tsx` / `Scrubber.tsx` / `Navbar.tsx` — pipeline overview, persistent phase-progress widget, reusable playback control, file upload.
- `styles/` — `colors.ts`/`fonts.ts` as shared TS tokens (components reference them directly for inline styles); `layout.css` for structural layout.

### Extending the language

To add a new token/construct, touch these in order: `dfa.ts` (new `State`/transition if it needs a new lexer state) → `tokens.ts` (`TokenKind`, `KEYWORDS` if a keyword) → `lexer.ts` (scan branch) → `ast.ts` (node shape) → `parser.ts` (parsing method, wrapped in `enter()`/`exit()`, using `expect()`/`consumeToken()` for every terminal — never a bare `advance()`) → `pda.ts` (add the non-terminal to `PDA_SYMBOLS`/`PDA_EDGES` if it's a new non-terminal) → `messages.ts` (`GRAMMAR_RULES` entry, `pdaPlain` push/pop text, `CONSUME_REASONS` entries for its terminals) → `docs/snek-grammar.md` (keep the BNF in sync — `messages.ts`'s `GRAMMAR_RULES` mirrors it by hand, not generated from it).

### Vite/React alias note

`vite.config.ts` aliases `react`/`react-dom`/`react/jsx-runtime` to `preact/compat` — this is a Preact project; `@xyflow/react` (used by `DfaGraph`) runs through that compat shim.
