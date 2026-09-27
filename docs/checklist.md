# Snek Project Checklist

Mirror of `tooldata/checklist.json`. Update JSON via tool; re-sync this file after.

Legend: `[x]` Done · `[ ]` Todo/In Progress/Review

## Phase 1: Grammar & Lexer
Define Snek's language and build the DFA-driven lexer.

- [x] Define Snek grammar (tokens, keywords, CFG rules)
  - [x] Enumerate token types & keyword list
  - [x] Draft CFG production rules
- [x] Build DFA transition table for lexer
  - [x] Define DFA alphabet & state set
  - [x] Define transition function (delta)
  - [x] Mark accepting states per token type
- [x] Implement lexer.ts (char stream -> tokens)
  - [x] Implement Token type & TokenKind enum
  - [x] Implement DFA-driven scan loop
  - [x] Handle whitespace/comment skipping
  - [x] Handle lexer errors (invalid char)
- [ ] Console-log DFA state transitions per char

## Phase 2: Parser
Build the CFG/PDA-based parser and AST for Snek.

- [x] Define CFG production rules for Snek (incl. `AssignStmt` for reassignment, added after the grammar was found to have no way to re-assign a declared variable)
- [x] Implement PDA-based/recursive-descent parser.ts
  - [x] Implement expression parsing (precedence climbing)
  - [x] Implement statement parsing (let, assign, print, if, while, block, expr-stmt)
  - [x] Implement explicit PDA stack tracking
  - [x] Trace every terminal token consumption (`expect()`/`consumeToken()`), not just non-terminal push/pop — a bare `advance()` left tokens invisible to the trace
- [x] Build AST node types
- [x] Expose parser stack trace for visualization

## Phase 3: DFA Graph Visualization
Render the DFA as an interactive React Flow graph.

- [x] Set up @xyflow/react canvas component
- [x] Render DFA states as nodes, transitions as edges
- [x] Highlight active state during lexing
- [x] Redraw DFA nodes as circles; accepting states as double circles
- [x] Add explicit start arrow into START state
- [x] Render live transition table (delta matrix) synced to current step
- [x] Enforce one-transition-per-character playback; show epsilon/acceptance as its own visible step

## Phase 3b: Source Input
Load Snek source into the app via .snek file upload.

- [x] Build .snek file upload input
- [x] Wire uploaded source into lexer/parser pipeline
- [x] Make the code panel editable (Save button / Ctrl+Enter to recompile), resizable, and permanently visible (split-screen, never covered by phase-view zoom transitions)

## Phase 4: Animation Layer
Cinematic zoom transitions with PPT-style playback controls.

- [x] Scrubber timeline controller (play/pause/step/scrub, speed dial)
- [x] Character-level highlight in the code pane during lexing; token-span highlight during parsing
- [x] Animate PDA stack push/pop during parsing
- [x] Fluid color/box-shadow transitions on state change (fixed-layer-count box-shadow so it cross-fades instead of snapping)

## Phase 5: PPT & Delivery
Record the demo and assemble the final presentation.

- [ ] Screen-record working animation
- [ ] Build slide deck (grammar, DFA, CFG, demo, decidability)

## Phase 6: Multi-Phase Compiler Flowchart
Zoomable cinematic view: major compiler phases (Tokenize -> Parse -> AST->instr -> CFG/optimize -> bytecode) as a flowchart, zoom into Phase1 DFA/PDA views, zoom out on completion with an animated token traveling between phase boxes.

- [x] Build PhaseFlowchart.tsx (major phases as boxes+edges)
- [x] Implement zoom-into-phase transition (confined to the left pane only — the code panel is a permanent sibling, untouched by it)
- [x] Implement zoom-out + phase completion state
- [x] Animate token/file traveling between phase boxes
- [x] Build Phase2 (Syntax Analysis) PDA view — split into a theoretical pane (`PdaGraph`, an actual 15-state PDA call graph, + `PdaTransitionTable`) and a technical pane (`PdaStackView` + `ParserTokenPanel`)
- [x] Build PhaseMinimap.tsx (persistent widget, bottom-right, above scrubber)
- [x] Sync minimap highlight with active phase + completion checkmarks

---

## Project Rules

See `docs/rules.md` — the canonical rules file (`tooldata/rules.md` is superseded and off-limits, do not read it).
