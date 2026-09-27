# Ouroboros — Presentation Kit

For the classmates building the deck. Everything needed is in this file:
the look, the slide-by-slide content with speaker notes, where screenshots go,
a Canva route, and a ready-to-paste prompt for Claude.

- **Format:** 16:9, 20 slides, 15–20 min talk (timing in §6).
- **Source of truth:** `docs/phase34plan.md` (theory + decisions). If a slide and that file disagree, the plan wins.
- **Status note:** Phases 1–2 exist in the app today. Phases 3–7 are planned and being built. Write the slides now; drop screenshots in last (§5). Never show a screenshot of a phase that isn't built yet — use the diagram described on the slide instead.

---

## 1. Visual identity (matches the app exactly)

### 1.1 Vibe
Dark, technical, calm. "A compiler under a microscope": a near-black canvas,
thin grey outlines, one glowing orange highlight for "what's happening right
now", green for "done/accepted". Lots of empty space. Diagrams over bullet
walls. Feels like a terminal or IDE, not a corporate template. No gradients,
no stock photos of people, no clip-art robots.

### 1.2 Colours (taken from `src/styles/colors.ts`)

| Role | Hex | Use |
|---|---|---|
| Background | `#0a0b0f` | every slide |
| Panel / card | `#12141c` | boxes, code blocks, tables |
| Border / hairline | `#242838` | card outlines, dividers |
| Idle node fill | `#1c2130` | inactive diagram shapes |
| Idle node outline | `#3d4459` | inactive diagram outlines |
| Text primary | `#e6e8ef` | titles, body |
| Text secondary | `#8b93a7` | captions, labels, footers |
| **Active (orange)** | `#f97316` | the ONE thing to look at on each slide; glow `rgba(249,115,22,0.5)` |
| **Accept / done (green)** | `#22c55e` | accepted, success, checkmarks |
| Error (red) | `#ef4444` | errors, rejected, DEAD state |
| ε / special (yellow) | `#facc15` | rare — special edges, warnings |
| Edge grey | `#4b5468` | arrows, connector lines |
| Code keyword | `#569cd6` | code snippets (VS Code dark palette) |
| Code number | `#b5cea8` | code snippets |
| Code comment | `#6a9955` | code snippets |

Rule of thumb: **one orange element per slide.** If everything glows,
nothing does.

### 1.3 Fonts (taken from `src/styles/fonts.ts`)
- **Headings and body:** Inter (free, Google Fonts). Titles SemiBold 36–44 pt; body Regular 18–22 pt.
- **Code, tokens, state names, formal notation:** JetBrains Mono (free, Google Fonts). If a tool doesn't have it: Fira Code, Roboto Mono, or Space Mono — any monospace, but only one across the deck.
- Formal symbols (δ, ε, Σ, ⇒, ⊢, q₀) are set in the monospace font.

### 1.4 Reusable graphic elements (draw as simple shapes/SVG)
All thin-outline (1.5–2 px), rounded, flat. Build these once and reuse:

1. **State circle** — idle: fill `#1c2130`, outline `#3d4459`. Active: fill `#f97316` + soft orange glow.
2. **Accepting state** — double circle (two concentric outlines).
3. **Start arrow** — short grey arrow pointing into a circle from nowhere.
4. **Transition arrow** — grey line with a small filled arrowhead, label in mono beside it (`[0-9]`).
5. **Input tape** — a row of square cells with one character each, a small ▲ head under the current cell (orange).
6. **Stack** — vertical pile of rounded rectangles, top one orange, label "top" beside it.
7. **Token pill** — rounded pill, kind in green mono (`IDENT`), lexeme in grey (`'x'`).
8. **Tree** — nodes as small rounded boxes joined by right-angle grey connectors (not diagonal lines).
9. **Basic block** — tall rounded rectangle containing 2–4 mono lines; green arrow for "true", red for "false", dashed for loop back-edges.
10. **Chomsky ladder** — four nested rounded rectangles (Regular ⊂ Context-free ⊂ Context-sensitive ⊂ Recursively enumerable), inner-most brightest.
11. **Phase pipeline** — 7 rounded boxes in a row joined by arrows; done = green outline + ✓, current = orange fill, upcoming = dim.
12. **Background texture (optional, subtle)** — a faint dot grid (`#242838` dots, 24 px spacing) or a very faint circuit-trace line in one corner. Never behind text.
13. **Footer** — bottom-left `Ouroboros · Theory of Computation`, bottom-right slide number, both in `#8b93a7`, 11 pt.

---

## 2. Two ways to build the deck

### Option A — Canva (easiest to edit together)
Canva's template catalogue changes, so search instead of relying on a fixed
template name. Search terms that tend to give the right look:
- `dark technology presentation`
- `minimal dark tech pitch deck`
- `developer presentation dark`
- `coding presentation`
- `neon minimal presentation` (then tone the neon down)

Pick one that has: a black/near-black background, lots of empty space, a
simple sans-serif, and few decorative images. Then:
1. Change the theme colours to the palette in §1.2 (Canva: *Styles → create palette* or edit each colour).
2. Set the fonts to Inter + a monospace (§1.3).
3. Delete stock photos; rebuild diagrams from shapes and lines (§1.4). Canva's *Elements* search: `circle outline`, `arrow line`, `rounded rectangle`, `flowchart`.
4. Paste slide text from §3. Put speaker notes into Canva's *Notes*.
5. Leave screenshot slots as grey placeholder boxes labelled with the §5 screenshot ID.

### Option B — Ask Claude to generate it
Paste the prompt in §4 into Claude **with this file attached**. It produces a
`.pptx` you can open in PowerPoint/Google Slides or import into Canva.

---

## 3. Slide-by-slide content

Format per slide: **On slide** (what's written — keep it short), **Visual**,
**Speaker notes** (what the presenter says — the "why"). Screenshot IDs refer
to §5.

### Slide 1 — Title
- **On slide:** `Ouroboros` · *Watching a compiler think, one automaton at a time* · team names · course name · date.
- **Visual:** Ouroboros logo (`public/sneklogo.png`) centred above the title; the 7-box phase pipeline (element 11) as a thin strip along the bottom, all boxes dim except the first in orange.
- **Speaker notes:** "Snek is a small programming language plus an interactive tool that shows every step a compiler takes to turn source code into a running program — and, for each step, which machine from Theory of Computation does the work."

### Slide 2 — Introduction: what is a compiler?
- **On slide:**
  - A compiler translates a program written for humans into a form a machine can run.
  - It works in **phases**: each phase takes the previous phase's output as input.
  - Each phase needs a different amount of computational power.
- **Visual:** `source code → [ compiler ] → program output`, the compiler box drawn as a black box with a "?" in orange.
- **Speaker notes:** "Our question for the project: what is inside that black box, and which ToC machine is the minimum needed for each part? The answer lines up with the Chomsky hierarchy we studied."

### Slide 3 — Why a toy language?
- **On slide:**
  - Real compilers (CPython, GCC) have hundreds of grammar rules and thousands of automaton states — impossible to show.
  - Snek goes through **the same phases** as CPython, but every state, rule and instruction fits on one screen.
  - Features: variables, `if`/`while`/`for`, functions, arrays, strings, `&& || !`.
- **Visual:** two stacked bars — "CPython grammar: ~hundreds of rules" (long, grey) vs "Snek grammar: ~45 rules" (short, orange). Label the bars in words, not exact counts, unless you verify the CPython number.
- **Speaker notes:** "A toy language isn't a shortcut on theory — it's what makes the theory visible."

### Slide 4 — The seven phases
- **On slide:** the pipeline, one line each:
  1. **Lexical Analysis** — characters → tokens
  2. **Syntax Analysis** — tokens → parse tree / AST
  3. **Semantic Analysis** — AST → checked AST + symbol table
  4. **AST → Instructions** — tree → linear instruction list (IR)
  5. **Control-Flow Graph + Optimize** — IR → graph of basic blocks → faster IR
  6. **Bytecode Emission** — IR → bytes
  7. **Execution (VM)** — bytes → program output
- **Visual:** pipeline element 11 with the seven boxes; screenshot `S1` beside it once available.
- **Speaker notes:** "This is the same shape as CPython: it stops at bytecode and runs it on a virtual machine — no native machine code, no linker."

### Slide 5 — The theory map (Chomsky hierarchy)
- **On slide:**

  | Language class | Machine | Snek phase |
  |---|---|---|
  | Regular | DFA | 1 Lexing |
  | Context-free | PDA (one stack) | 2 Parsing |
  | Beyond context-free | symbol table + tree walk | 3 Semantic |
  | Recursively enumerable | Turing machine ≈ VM | 7 Execution |

- **Visual:** Chomsky ladder (element 10), each ring labelled with its phase.
- **Speaker notes:** "Each phase exists because the one before it *can't* do the next job: a DFA can't match nested brackets, so we need a PDA; a PDA can't check that variables are declared, so we need semantic analysis; and the program itself is Turing-complete, so no phase can predict whether it halts."

### Slide 6 — The Snek language
- **On slide:** the demo program (monospace, syntax-coloured with §1.2 code colours):
  ```
  fn square(n) {
    return n * n;
  }
  let limit = 1 + 2;
  let total = 0;
  for (let i = 0; i < limit; i = i + 1) {
    total = total + square(i);
  }
  let names = ["lo", "hi"];
  if (total > 4 && !false) {
    print names[1];
  } else {
    print total;
  }
  if (false) { print "never"; }
  ```
- **Visual:** code card (panel colour) on the left; on the right, small callouts pointing at lines: "folded to 3 (Phase 5)", "for → while (Phase 4)", "removed as dead code (Phase 5)".
- **Speaker notes:** "This one program touches every phase. Output: `hi` (total = 0 + 1 + 4 = 5)."

### Slide 7 — Phase 1: Lexical Analysis = a DFA
- **On slide:**
  - Input: characters. Output: tokens (`LET`, `IDENT 'x'`, `ASSIGN`, `NUMBER '5'`, `SEMI`).
  - A **DFA** M = (Q, Σ, δ, q₀, F): states, character classes, transition function, start state, accepting states.
  - Deterministic: exactly one next state for every (state, character).
- **Visual:** a mini DFA: START → IN_IDENT (loops on `[a-zA-Z0-9_]`) and START → IN_NUMBER (loops on `[0-9]`), both double-circled; tape (element 5) above reading `let x = 5;`; token pills (element 7) below. Screenshot `S2` once available.
- **Speaker notes:** "Tokens form a regular language — there's no nesting inside a single token — so a finite automaton with no memory beyond its current state is enough."

### Slide 8 — Phase 1: longest match, errors, keywords
- **On slide:**
  - **Longest match:** run the DFA until the next character has no move; emit the longest accepted prefix; restart at START. The stopping character is *not* consumed.
  - **Total δ:** every undefined move goes to a **DEAD** trap state → lexical error.
  - **Keywords:** `IN_IDENT` accepts any name; a keyword table then turns `let` into `LET`.
  - `123abc` → error (names can't start with a digit — the first character decides the token class).
- **Visual:** tape reading `x+` with the head stuck on `+` (orange), caption "IN_IDENT has no move on '+' → emit IDENT 'x', restart". Small red DEAD circle in the corner. Screenshot `S3`.
- **Speaker notes:** "A textbook DFA has no ε-moves, so 'go back to START' isn't an edge in δ — it's the scanner's action after acceptance. Python reports `123abc` as 'invalid decimal literal'; we do the same."

### Slide 9 — Phase 2: Syntax Analysis = a context-free grammar + PDA
- **On slide:**
  - Input: tokens. Output: a parse tree.
  - Programs nest (`if` inside `while` inside a function), so a DFA can't do it — nesting needs **a stack**.
  - Grammar in BNF, e.g. `LetStmt → let IDENT = Expr ;`
  - PDA moves: **expand** (replace a rule by its right side) and **match** (pop a token that equals the input).
  - Accept: input fully read **and** stack empty.
- **Visual:** the expand/match trace for `let x = 5;` as a table (stack │ input │ move), last row `ACCEPT` in green. Screenshot `S4`.

  ```
  stack                 input        move
  Program               let x = 5 ;  expand
  LetStmt               let x = 5 ;  expand
  let IDENT = Expr ;    let x = 5 ;  match
  IDENT = Expr ;        x = 5 ;      match
  = Expr ;              = 5 ;        match
  Expr ;                5 ;          expand … NUMBER
  NUMBER ;              5 ;          match
  ;                     ;            match
  (empty)               (empty)      ACCEPT
  ```
- **Speaker notes:** "Balanced brackets like `(( ))` are the classic non-regular language — the pumping lemma for regular languages rules out a DFA. One stack is exactly enough."

### Slide 10 — Phase 2: LL(1) — a deterministic PDA
- **On slide:**
  - **FIRST(X)** = tokens that can start X. Example: FIRST(LetStmt) = {`let`}.
  - **LL(1):** read Left to right, Leftmost derivation, **1** token of lookahead is always enough to choose the rule → the PDA never guesses.
  - **Left-factoring:** `a[i] = 5;` vs `a[i];` share a long prefix, so we parse an expression first, then an optional `= Expr`.
  - A conflict-free LL(1) table ⇒ the grammar is unambiguous.
- **Visual:** a small LL(1) table (rows: `Statement`, `Unary`; columns: `let`, `print`, `if`, `-`, `IDENT` …) with one cell in orange. Screenshot `S5`.
- **Speaker notes:** "General PDAs can be nondeterministic; ours is deterministic because of how the grammar is written. That's why parsing is fast and predictable."

### Slide 11 — Phase 2: parse tree → AST
- **On slide:**
  - The **parse tree** is the proof that the program fits the grammar.
  - The **AST** keeps only the meaning: no `;`, no `=`, no chains of one-child rules.
  - Precedence comes from rule layering; there's no dangling-`else` because `if` always needs `{ }`.
- **Visual:** left: parse tree for `let x = 5;` (element 8); right: AST `Let(x, 5)` — an arrow labelled "trim" between them. Screenshot `S6`.
- **Speaker notes:** "Leftmost derivation: `Program ⇒ LetStmt ⇒ let IDENT = Expr ; ⇒ … ⇒ let x = 5 ;` — the parse tree is that derivation drawn as a tree."

### Slide 12 — Phase 3: Semantic Analysis — beyond context-free
- **On slide:**
  - Checks a grammar can't: is `x` declared before use? Does `x + true` make sense? Right number of arguments?
  - Why not in the grammar: `{ w c w }` (a string, a separator, the same string again) is **not context-free** (pumping lemma). "Declare, then use the same name" has that shape.
  - Tool: a **symbol table** as a stack of scopes (`{` push, `}` pop) + a type for every expression.
- **Visual:** scope stack (element 6) with cards `total : int @0`, `i : int @1`; a red-outlined expression `x + true` with "type error". Screenshot `S7`.
- **Speaker notes:** "The grammar deliberately accepts a *superset* of valid programs; semantic analysis narrows it down. Exact typing of arbitrary programs is undecidable, so we check what's knowable from literals and declarations and leave the rest to runtime."

### Slide 13 — Phase 4: AST → Instructions
- **On slide:**
  - **Syntax-directed translation:** each AST node kind has one translation rule.
  - `a + b` ⇒ code(a) · code(b) · `BINARY_OP +` — operands first, operator last (post-order), because the target is a **stack machine**.
  - `if`/`while` become jumps; jump targets are filled in later (**backpatching**).
  - `for` is rewritten into `while` first (**syntactic sugar**).
- **Visual:** AST on the left, instruction list growing on the right; one jump shown as `POP_JUMP_IF_FALSE ?` → `POP_JUMP_IF_FALSE 7`. Screenshot `S8`.
- **Speaker notes:** "This is where the source code visually turns into instructions in the app — each statement's line fades and its instructions appear."

### Slide 14 — Phase 5: Control-Flow Graph + Optimize
- **On slide:**
  - **Basic block:** straight-line code with one entry and one exit. **Leaders:** first instruction, jump targets, instructions after a jump.
  - Optimizations: **constant folding** (`1 + 2` → `3`), **constant propagation**, **dead-code elimination**, **peephole** clean-ups.
  - Repeated until nothing changes — guaranteed to stop because every rewrite shrinks the code or replaces a variable load with a constant.
- **Visual:** block graph before/after (element 9): the `if (false)` block fading out; `LOAD_CONST 1, LOAD_CONST 2, BINARY_OP +` collapsing to `LOAD_CONST 3`. Screenshot `S9`.
- **Speaker notes:** "Never folds `x / 0` — an optimizer may not change whether an error happens."

### Slide 15 — Phase 5: why optimizers can't be perfect (Rice's theorem)
- **On slide:**
  - "Will this block ever run?" is a non-trivial property of what a program *does* → **undecidable** in general (Rice's theorem; it would solve the halting problem).
  - What Snek removes: blocks with **no path** from the start in the graph (plain graph search — decidable) and branches whose condition is a constant.
  - So the optimizer is **sound** (never removes live code) but **incomplete** (can't remove all dead code).
- **Visual:** two panels: left "decidable: graph reachability" (small graph, BFS highlight in green); right "undecidable: runtime reachability" (a block behind a `while` with a question mark in orange).
- **Speaker notes:** "This is the most direct ToC result in the whole project: a real engineering limit that follows from a theorem."

### Slide 16 — Phase 6: Bytecode Emission
- **On slide:**
  - Labels become **relative jump offsets**; each instruction becomes **2 bytes** (opcode, argument), like CPython's "wordcode".
  - Output per function: the bytes, a constants table, a variable-name table, a line table.
  - Shown like Python's own `dis` module: line · offset · instruction · argument.
- **Visual:** `dis`-style table with a hex row under one instruction: `POP_JUMP_IF_FALSE L_else` → `2C 03` (illustrative bytes — use the real ones from the app once the opcode table exists). Screenshot `S10`.
- **Speaker notes:** "A deterministic, total translation — a computable function from instructions to bytes. No automaton needed, just assembly."

### Slide 17 — Phase 7: Execution — the VM as a universal machine
- **On slide:**
  - Fetch → decode → execute, with an operand stack, a call-frame stack, and a program counter.
  - The VM runs *any* Snek program given as data → a **universal machine**.
  - With unbounded integers and `while`, Snek is **Turing-complete**. One stack = PDA; two stacks + memory = Turing machine.
  - Halting is undecidable → the VM stops after 10 000 steps and says why.
- **Visual:** operand stack + frame stack side by side (element 6 twice), console box showing `hi`, and a red banner "Stopped after 10 000 steps — halting problem". Screenshot `S11`.
- **Speaker notes:** "We started with a machine that can only remember one state and ended with one that can compute anything computable — the whole course, in one pipeline."

### Slide 18 — Live demo
- **On slide:** `Live demo` · the four error one-liners listed small:
  `let x = 123abc;` (lexical) · `let = 5;` (syntax) · `let y = x + true;` (semantic) · `print 1 / 0;` (runtime) · `while (true) { }` (step cap).
- **Visual:** screenshot `S1` dimmed as background, "Live demo" centred.
- **Speaker notes:** follow the timing script in §6.

### Slide 19 — Conclusion
- **On slide:** one line per phase —
  - Lexing: a DFA is enough because tokens don't nest.
  - Parsing: nesting needs a stack → PDA.
  - Semantic: names and types aren't context-free → symbol table.
  - IR + bytecode: syntax-directed, deterministic translation.
  - Optimizing: decidable approximations of an undecidable question.
  - Execution: Turing-complete → halting undecidable.
- **Visual:** Chomsky ladder again, now fully lit, with the pipeline strip below all green ✓.
- **Speaker notes:** "Every phase is the weakest machine that can do its job — and each limit is a theorem from this course."

### Slide 20 — Thank you / Q&A
- **On slide:** `Thank you` · `Questions?` · repo or contact line.
- **Visual:** logo small, dot-grid background.

---

## 4. Prompt for Claude (paste as-is, attach this file)

```
You are designing a 16:9 presentation deck for a university Theory of
Computation course project called "Ouroboros" (a visualizer of a compiler for a toy language called Snek). The attached file ppt.md is the
complete brief. Follow it exactly.

Output: a .pptx file (20 slides) built with python-pptx, plus speaker notes
on every slide taken from the "Speaker notes" lines in section 3.

Content:
- Use section 3 of ppt.md slide by slide: slide titles, "On slide" text
  verbatim (you may shorten wording but never change technical meaning,
  symbols, or code), and draw the described "Visual" with native shapes.
- Where a slide names a screenshot ID (S1–S11), add a grey rounded
  placeholder rectangle (#1c2130 fill, #3d4459 dashed outline) with the ID
  and its description from section 5 centred in #8b93a7, sized to fill the
  visual area. Do not invent screenshots.
- Code blocks: monospace, on a #12141c rounded card, keywords #569cd6,
  numbers #b5cea8, comments #6a9955, other code #d4d4d4.
- Tables: #12141c background, #242838 hairlines, header row in #8b93a7.

Look and feel (section 1 of ppt.md):
- Background #0a0b0f on every slide. Text #e6e8ef, secondary #8b93a7.
- Exactly one highlighted element per slide in orange #f97316 (with a soft
  glow if possible). Green #22c55e only for accepted/done/success. Red
  #ef4444 only for errors/DEAD. Yellow #facc15 rarely.
- Fonts: Inter for titles (SemiBold, 36-44 pt) and body (Regular, 18-22 pt);
  JetBrains Mono for code, token names, state names and formal symbols
  (δ, ε, Σ, ⇒, q₀). If unavailable, fall back to Fira Code, then any single
  monospace.
- Diagrams from flat, thin-outline (1.5-2 px), rounded shapes: state
  circles (idle fill #1c2130, outline #3d4459; active fill #f97316), double
  circles for accepting states, grey #4b5468 arrows with small heads and
  monospace labels, tape of square cells with a small orange ▲ head, stacks
  of rounded rectangles with the top one orange, token pills (kind in green
  monospace, lexeme in grey), trees with right-angle connectors, basic
  blocks with green true-edges / red false-edges / dashed back-edges, the
  Chomsky hierarchy as four nested rounded rectangles, and a 7-box phase
  pipeline strip.
- Lots of empty space, no gradients, no stock photos, no clip-art, no
  emoji. Optional faint dot grid (#242838, 24 px) away from text.
- Footer on every slide except the title: bottom-left
  "Ouroboros · Theory of Computation", bottom-right slide number, #8b93a7, 11 pt.
- Max 5 bullets per slide, max ~12 words per bullet.

Accuracy rules:
- Keep every theory statement exactly as meant in ppt.md (DFA has no
  ε-moves; LL(1) = one token of lookahead; Rice's theorem applies to
  semantic properties; two stacks = Turing-machine power). If something
  seems wrong, keep it and list your concern at the end instead of
  changing it.
- Do not add slides, facts, statistics, or citations not in ppt.md.

Finish by listing: any font substitutions, any concerns, and which slides
still need screenshots.
```

---

## 5. Screenshot list (capture last, from the finished app)

Capture on `demo.snek`, dark theme, browser window about 1600×900, app zoom
100%. Crop to the left pane unless noted.

| ID | Phase | Where in the app | What must be visible |
|---|---|---|---|
| S1 | — | Flowchart view | all 7 boxes, Phases 1–2 green ✓, Phase 3 orange |
| S2 | 1 | Lexical view, first `let` | tape, DFA graph with IN_IDENT orange, 5-tuple panel |
| S3 | 1 | Lexical view, the step right after `limit` (first line with `let limit`) | head stuck on the space after `limit` (not consumed), 2×2 explanation grid showing "no move" |
| S4 | 2 | Syntax view, mid-`let` statement | PDA configuration (stack + input), derivation strip |
| S5 | 2 | Syntax view, LL(1) tab | table with the current cell highlighted |
| S6 | 2 | Syntax view, Parse tree tab → AST toggle | both states (two screenshots side by side) |
| S7 | 3 | Semantic view, inside the `for` block | scope stack with two scopes, type badges on AST |
| S8 | 4 | IR view, at an `if` | split right panel (source dimming, IR growing), a `?` jump being patched |
| S9 | 5 | Control-flow graph view | before/after of the `if (false)` block removal |
| S10 | 6 | Bytecode view | `dis` table with hex rows |
| S11 | 7 | VM view, end of run | stacks, console showing `hi` (take a second one with the step-cap banner using `while (true) { }`) |

---

## 6. Talk timing (15–20 min)

| Slides | Segment | Time |
|---|---|---|
| 1–5 | Title, intro, why toy, phases, theory map | 3 min |
| 6 | The language | 0.5 min |
| 7–8 | Phase 1 | 2 min |
| 9–11 | Phase 2 | 3 min |
| 12 | Phase 3 | 1.5 min |
| 13 | Phase 4 | 1.5 min |
| 14–15 | Phase 5 | 2 min |
| 16 | Phase 6 | 1 min |
| 17 | Phase 7 | 1.5 min |
| 18 | Live demo (only if time allows; otherwise screenshots already cover it) | 2–3 min |
| 19–20 | Conclusion, Q&A | 1 min + questions |
| | **Total** | **~19 min** |

---

## 7. Likely viva questions (short answers for whoever presents)

- **Why is lexing a DFA and not a PDA?** Tokens don't nest; a regular language needs no stack, and a DFA runs in linear time with constant memory.
- **Your lexer "restarts at START" — isn't that an ε-move?** No. The DFA recognizes one token; restarting is the scanner's longest-match action, outside δ.
- **Why can't the grammar check variable declarations?** "Declare then use the same name" has the shape of `{ w c w }`, which is not context-free (pumping lemma for CFLs).
- **Is your PDA deterministic?** Yes — the grammar is LL(1): the parse table has no conflicts, so one lookahead token always picks the rule.
- **How do you know the grammar is unambiguous?** A conflict-free LL(1) grammar has at most one leftmost derivation per input.
- **Why not remove all dead code?** Deciding whether code runs is a semantic property of programs → undecidable by Rice's theorem. We remove only graph-unreachable code, which is decidable.
- **Why does the VM have a step limit?** Snek is Turing-complete, so halting is undecidable; a budget is the only general option.
- **Why stop at bytecode, not machine code?** Same choice as CPython and Java: bytecode run by a virtual machine. Native code generation adds no new ToC concept.
