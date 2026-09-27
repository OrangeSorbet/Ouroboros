# Ouroboros — Master Plan: Phase 1–2 Fixes, Phases 3–7, and the PPT

Status: **approved plan, not yet implemented.** Written 2026-09-27 from a
questionnaire session (questions, answers and final decisions all recorded
below). Nothing in `src/` has changed yet.

Read order for a teammate: §1 (what the app will be) → §2 (theory map) →
§15 (demo script) → §16 (PPT plan). Implementers: everything, in order.

---

## 1. Final phase lineup

The flowchart grows from 5 boxes to 7. Every box becomes a real, zoomable,
step-by-step view — nothing stays "symbolic".

| # | Flowchart box | Input → Output | ToC model | Right-hand panel |
|---|---|---|---|---|
| 1 | Lexical Analysis | characters → tokens | DFA + longest-match scanner (regular languages) | Code panel |
| 2 | Syntax Analysis | tokens → parse tree / AST | CFG + deterministic PDA, LL(1) (context-free languages) | Code panel |
| 3 | Semantic Analysis | AST → annotated AST + symbol table | beyond context-free (context-sensitive checks) | Code panel |
| 4 | AST → Instructions | annotated AST → IR instruction list | syntax-directed translation | Code panel **morphs into** IR panel |
| 5 | Control-Flow Graph + Optimize | IR → basic-block graph → optimized IR | graph reachability; decidability / Rice's theorem | IR panel |
| 6 | Bytecode Emission | optimized IR → bytes + constant/name tables | deterministic assembly (computable function) | IR panel (bytes view) |
| 7 | Execution (VM) | bytecode → program output | stack machine ≈ Turing machine; halting problem | IR panel (PC highlight) |

**Naming rule (fixes the "CFG" clash):** "CFG" is never used alone in the
UI. Phase 2 always says **"Grammar (context-free grammar)"**; Phase 5 always
says **"Control-Flow Graph"**.

---

## 2. Theory map (the spine of the whole project and the PPT)

Chomsky hierarchy, bottom to top, and where each phase sits:

| Language class | Machine | Snek phase | What it can't do (forces the next phase) |
|---|---|---|---|
| Regular | DFA | 1 Lexing | Can't match nested brackets `(( ))` — needs memory of unbounded depth |
| Context-free | PDA (one stack) | 2 Parsing | Can't check "declared before use" or types — that's like `{ w c w }`, which is **not** context-free (pumping lemma) |
| Context-sensitive-ish properties | symbol table + tree walk (an algorithm, not a named automaton) | 3 Semantic | — |
| (translation, not recognition) | syntax-directed translation | 4 IR gen | — |
| Decidable approximations of undecidable questions | graph algorithms (BFS reachability, fixpoint iteration) | 5 Optimize | Exact dead-code / optimality questions are undecidable (Rice's theorem) — so it only removes *provably* dead code |
| Recursively enumerable | Turing machine ≈ stack VM with unbounded memory | 7 Execution | Halting is undecidable — the VM uses a step cap and says so |

Talking point: **a PDA has one stack; a machine with two stacks is as powerful
as a Turing machine.** The VM (operand stack + call-frame stack + unbounded
integers) is exactly that jump.

---

## 3. Audit of the current Phases 1–2 (plot holes found)

Each item is fixed by the plan in §8 / §9.

### Phase 1 (lexer / DFA)
1. **ε-edges in δ.** A DFA has no ε-moves, so the current `TRANSITIONS` is formally an ε-NFA. The "accept and restart" belongs to the scanner loop, not to δ.
2. **δ is not total.** START on an unknown char throws without entering DEAD; DEAD has no self-loop; IN_COMMENT has no exit edge (newline handled in code); whitespace/newline/EOF produce no trace steps.
3. **Single-char tokens** drawn as a START→START self-loop that emits — no real accepting state.
4. **Keywords** resolved by a post-accept table lookup, never shown or explained.
5. **Maximal munch** relies on a 1-char peek that isn't shown or named.
6. **`123abc`** lexes as `NUMBER` + `IDENT` silently; real compilers reject it.
7. **Transition-table highlight bug:** matches on (from, to) only, so SAW_EQ's `=` and ε rows light up together; same for IN_IDENT's letter/digit loops.
8. **Lex errors discard the trace:** `LexError.partialTrace` exists but `app.tsx` clears `steps`.
9. **Comments produce no chapter boundary** in the scrubber.

### Phase 2 (parser / PDA)
1. The **15-state "PDA" graph is a call graph** (formally a recursive transition network), not the textbook PDA — unexplained.
2. **Missing `Unary → Unary` edge** in `PDA_EDGES` although `Unary -> "-" Unary` exists.
3. **`Expr` never pushed** — the trace skips a grammar symbol.
4. **`docs/snek-grammar.md` omits `Block` from `Statement`** (parser and `messages.ts` include it).
5. Grammar is **EBNF** (`*`, `?`), not pure CFG notation; **EOF never consumed/traced**.
6. **False narration:** "AssignStmt IDENT already confirmed to exist" — nothing checks that (and it *can't* be checked by a CFG).
7. **AST built and thrown away** — no parse tree or derivation shown.
8. **Parse errors show only a message** — no partial-trace replay.
9. **LL(1)-with-one-LL(2)-spot** nature never stated; no FIRST/FOLLOW or parse table.
10. **`ParserTokenPanel` hides EOF** — nothing highlighted when lookahead is EOF.
11. "CFG" means two different things across phases (see §1 naming rule).
12. `docs/compiler-phases.md` cites stale paths (`src/dfa.ts` → `src/compiler/dfa.ts`).

---

## 4. The questionnaire — questions, answers, decisions

★ = recommendation offered. "Decision" is what will be built.

### 4.0 Goal and audience

| # | Question | Answer | Decision |
|---|---|---|---|
| 1 | Main audience? | (b) examiner at viva | Viva-first: every step defensible in formal terms |
| 2 | Demo length? | free-form, but **15–20 min total** | Curated demo program + timing script (§15) |
| 3 | Theory depth? | (a) course level, formal | Formal notation everywhere (δ, 5-tuples, derivations), plain "why" alongside |
| 4 | Presentation mode? | no | Not built |

### 4.1 Global layout

| # | Question | Answer | Decision |
|---|---|---|---|
| 5 | Code panel in all phases? | Code must be *visually converted* into IR; code panel replaced by an IR panel; conversion explained per step | Code panel through Phases 1–3; in Phase 4 it morphs into the IR panel statement by statement (§11); IR panel for Phases 5–7 |
| 6 | Where does narration live? | Drawer sections are good but space is tight — keep it in the scrubber, as a **2×2 grid** replacing the description line | Scrubber area = controls + 2×2 grid: **What happened / Why (theory) / Formal notation / What's next**. Minimal padding, ≤2 short lines per cell |
| 7 | Glossary? | (a) hover-to-define | Dotted-underline ToC terms; hover shows definition. Terms live in `messages.ts` |
| 8 | Theory primer per phase? | (a) intro card on zoom-in, dismissible | One card per phase: what the phase does, its machine, its input/output |
| 9 | Add Semantic Analysis box? | yes (a) | Added as Phase 3 (see §1) |
| 10 | Theme? | (a) keep dark glass | Unchanged |
| 11 | Cross-phase linking? | no, too much | Not built |
| 12 | Screen target? | laptop | 1366–1920 wide |

### 4.2 Phase 1 theory fixes

| # | Question | Answer | Decision |
|---|---|---|---|
| — | ε-moves? (user note) | "It was supposed to be a DFA with accept states, then after accepting move to start — ε-moves must be removed" | Correct. ε removed; restart is the scanner's longest-match action (§5.1, §8) |
| 13 | ε-edges treatment | (a) remove, draw restart as driver action | As stated |
| 14 | Make δ total? | didn't understand — best action | Every undefined (state, class) pair → DEAD; DEAD self-loops on all of Σ. Graph shows one note on DEAD instead of dozens of edges; a DEAD edge is drawn only when the trace takes it. Table lists full δ (§5.2) |
| 15 | Single-char tokens | didn't understand — best action | One accepting state `SINGLE`, entered on any of the single-char symbols; kind chosen by lexeme lookup (§5.3) |
| 16 | Keywords | best action | Keep small DFA + visible "keyword check" step on IN_IDENT acceptance (§5.4) |
| 17 | Show whitespace/newline/EOF steps? | yes | Whitespace becomes a real accepting-discard state; EOF gets its own final step |
| 18 | Regex→NFA→DFA pipeline? | no — show compiler phases, not how to build a lexer generator. "Is a toy compiler OK?" | Skipped. Toy compiler is the right call (§5.5) |
| 19 | 5-tuple panel? | yes | Live (Q, Σ, δ, q₀, F) panel with current state/class highlighted |
| 20 | Show lookahead char? | only if helpful and not noisy | Replaced by the input tape (Q25): the head *doesn't move* on a non-consumed char — shows lookahead without extra UI |
| 21 | `123abc`? | didn't understand ("variables can be alphanumeric, why not this?") — explained (§5.6) | **Lexical error**, like Python/C |
| 22 | Replay lex errors? | yes | Partial trace kept and playable; offending char red |
| 23 | Fix table highlight bug? | yes | Match on (state, class) |

### 4.3 Phase 1 UI

| # | Question | Answer | Decision |
|---|---|---|---|
| 24 | Graph layout | (c) auto-layout — main goal: ordered, **no overlaps**, not messy | **elkjs** layered layout with orthogonal edge routing, for all graphs (DFA, call graph, parse tree, AST, control-flow graph). New dependency — user installs it (rules: no npm by the agent) |
| 25 | Input tape? | explained (§5.7) → yes | One-row tape (current line) with head marker above the graph |
| 26 | Token-list click-to-seek? | unnecessary | Not built |
| 27 | Edge labels | explained (§5.8) | Actual set (`[a-zA-Z_]`) on edge; class name on hover |
| 28 | Travelling dot on edge? | no | Not built |

### 4.4 Phase 2 theory fixes

| # | Question | Answer | Decision |
|---|---|---|---|
| 29 | Which PDA picture? | explained (§5.9) → ★ | **Textbook PDA is the main view** (stack of grammar symbols, expand/match moves). Call graph kept as a secondary tab, honestly labelled "Call graph (recursive transition network)" |
| 30 | Pure BNF? | explained (§5.10) → ★ | Pure BNF is the official grammar in the UI; EBNF shown alongside as "shorthand" |
| 31 | Push `Expr`? | explained (§5.11) → ★ | Every grammar symbol appears in the trace — no skipped non-terminals |
| 32 | Fix `Unary→Unary` edge + grammar doc `Block`? | yes | Fixed (and made impossible to recur — §9.1) |
| 33 | Live parse tree? | explained (§5.12) → ★ | Parse tree grows live; toggle Parse tree / AST |
| 34 | Derivation strip? | explained (§5.13) → ★ | One-line leftmost-derivation strip (= matched input + stack) |
| 35 | FIRST/FOLLOW + LL(1) table? | explained (§5.14) → ★ | LL(1) table tab, current cell highlighted |
| 36 | Consume EOF explicitly? | yes | Final `match $` step |
| 37 | Name acceptance condition? | yes | "Accept: input fully read and stack empty" |
| 38 | Ambiguity / precedence explanation? | yes | Intro card + Formal cell explain: no dangling-else (mandatory `Block`), precedence by rule layering, left-associativity (§9.4) |
| 39 | Parse-error replay + expected set? | yes | Partial trace playable; error shows "expected one of {…} (from LL(1) table row), found X" |
| 40 | Remove false "already exists" claim? | yes | Replaced by a pointer: "declared-before-use is checked in Semantic Analysis — not expressible in a context-free grammar" |

### 4.5 Phase 2 UI

| # | Question | Answer | Decision |
|---|---|---|---|
| 41 | Layout with parse tree added — "why is the parse tree in syntax analysis?" | explained (§5.12) → ★ | Parse tree is Phase 2's *output*, like tokens are Phase 1's. Layout in §9.5 |
| 42 | Dotted rules in stack? | explained (§5.15) → ★ | Call-graph tab's frame list shows dotted rules |
| 43 | Show EOF + 2-token lookahead window? | explained (§5.16) → ★ | EOF shown. **2-token window superseded:** the extended grammar is left-factored and fully LL(1) (§7.3), so only 1 lookahead token is ever needed |

### 4.6 Semantic analysis (Phase 3)

| # | Question | Answer | Decision |
|---|---|---|---|
| 44 | Which checks? | (a) undeclared, redeclared, type check | Plus arity, `return` placement, lvalue validity (§10) |
| 45 | Scoping? | best action | Lexical block scope; symbol table = stack of scopes; shadowing allowed, same-scope redeclaration is an error (§7.5) |
| 46 | Visualize symbol table + annotated AST walk? | yes | §10.3 |
| 47 | Explain why it's not context-free? | (a) yes | `{ w c w }` pumping-lemma sketch in intro card + Formal cells |

### 4.7 AST → Instructions (Phase 4)

| # | Question | Answer | Decision |
|---|---|---|---|
| 48 | IR style | (a) stack-machine bytecode, CPython-like | §11.1 instruction set |
| 49 | Visualization | (a) animated post-order AST walk emitting instructions | §11.3 |
| 50 | Jumps for if/while | (a) show backpatching | `?` placeholder, patched later, visibly |
| 51 | Syntax-directed translation framing | yes | Each AST node kind has a translation rule shown in the Formal cell |

### 4.8 Control-Flow Graph + Optimize (Phase 5)

| # | Question | Answer | Decision |
|---|---|---|---|
| 52 | Rename box | (a) "Control-Flow Graph + Optimize" | Done in §1 |
| 53 | Build it for real, animated? | yes | Leaders → basic blocks → edges, step by step |
| 54 | Optimizations | default (a–d) | Constant folding, constant propagation (block-local), dead-code elimination (unreachable blocks), peephole. **Not:** algebraic simplification, liveness/dataflow |
| 55 | Before/after diff + justification? | yes | Every rewrite is one step with diff and reason |
| 56 | Decidability panel? | yes | Rice's theorem explained where DCE runs (§12.4) |
| 57 | Graph type | yes (★) | elkjs directed graph of basic blocks; true = green, false = red, loop back-edges dashed |

### 4.9 Bytecode (Phase 6) and Execution (Phase 7)

| # | Question | Answer | Decision |
|---|---|---|---|
| 58 | Output format | "whatever is accurate in compilers; human-readable is fine" | CPython-accurate: `dis`-style disassembly (line, offset, opname, arg, resolved value) **plus** the raw bytes row — the bytes are the real output, `dis` is how real tools display it |
| 59 | Add a VM? | only if not heavy | Not heavy (~200 lines core) → **added as Phase 7** |
| 60 | Universal machine / Turing-complete framing? | yes | §14.4 |
| 61 | Step cap for infinite loops? | yes | 10 000 executed instructions; message names the halting problem |

### 4.10 Language scope, playback, process

| # | Question | Answer | Decision |
|---|---|---|---|
| 62 | Extend Snek? | yes, all | Strings, `for`, functions, arrays, `&& \|\| !`, `/* */` comments (§7) |
| 63 | Number semantics? | explained (§5.17) → ★ | Unbounded integers (`BigInt`), `/` truncates toward zero, divide-by-zero = runtime error, never constant-folded |
| 64 | Scrubber chapters for later phases | per statement | Phases 2–7 chaptered per top-level statement (and per function); Phase 1 stays per token |
| 65 | Cite exact rule inline? | (covered by Q6 grid) | The Formal cell always cites the exact δ entry / production / translation rule / optimization rule |
| 66 | Flag simplifications? | yes | Any shorthand is labelled as such in the Why cell |
| 67 | Order of work | (a) fix Phases 1–2 first | §17 |
| 68 | Plan deliverable | (a) markdown in `docs/` | This file |
| 69 | PPT timing | PPT at the end; plan it now for a teammate | §16 |
| 70 | Anything to remove from the current UI? | no | — |

### 4.11 Follow-ups (all answered "all ★")

| # | Follow-up | Decision |
|---|---|---|
| F1 | `123abc` → error | Yes |
| F2 | Add elkjs | Yes (user installs) |
| F3 | Input tape, drop ghost cursor | Yes |
| F4 | PDA picture | Textbook PDA main + call-graph tab |
| F5 | Pure BNF official, EBNF as shorthand | Yes |
| F6 | Live parse tree with AST toggle | Yes |
| F7 | Derivation strip | Yes |
| F8 | LL(1) table tab | Yes |
| F9 | Dotted rules in technical stack | Yes |
| F10 | All six language features | Yes, all |
| F11 | `BigInt` + truncating division | Yes |
| F12 | Code panel for 1–3, IR panel from 4 | Yes |

---

## 5. Concept explanations (kept for the teammate and the viva)

### 5.1 Why the ε-moves go — longest match
A DFA recognizes **one** token. The scanner runs it until the next character
has no transition. Then the scanner (not the DFA) checks whether the last
state reached was accepting: if yes, it emits that token and restarts the DFA
at START; the character that had no move is **not consumed** — it begins the
next token. Example `x+`: START –x→ IN_IDENT; IN_IDENT has no move on `+` →
token ends → IN_IDENT is accepting → emit `IDENT 'x'` → restart at START,
which reads `+`. This rule ("take the longest prefix the DFA accepts") is
called **longest match / maximal munch**. So restart is an action, not an
edge; δ has no ε.

### 5.2 Total δ and the DEAD state
A DFA must define **exactly one** next state for every (state, input) pair.
Missing entries all go to one **DEAD** (trap) state, which loops to itself on
every input ("once failed, always failed"). An error is reported when the run
dies without having passed an accepting state since the token started.

### 5.3 Single-character tokens
START itself can't accept (an empty string is not a token), so reading `+`
must lead to an accepting state. One grouped state `SINGLE` accepts all
single-char symbols; which token kind it emits is decided by the lexeme
(same trick as keywords). Nine separate states would recognize the same
language but clutter the graph.

### 5.4 Keywords
A DFA that recognized keywords directly would need a chain per keyword
(`l → le → let`, falling back to IDENT on `lets`), ~30 extra states. Instead
IN_IDENT accepts any identifier and a visible **keyword check** step maps
reserved words (`let` → `LET`). Same language recognized; this is how real
hand-written lexers usually do it.

### 5.5 Why a toy compiler is the right choice
CPython's grammar has hundreds of rules and its lexer automaton thousands of
states — unshowable. Snek goes through the **same phases** with every state,
rule and instruction fitting on one screen, which is exactly what a ToC demo
needs.

### 5.6 Why `123abc` is an error
Identifiers may *contain* digits (`abc123` is valid) but must **start with a
letter**, because the lexer decides the token class from the **first
character**: if names could start with digits, `123` itself would be
ambiguous. `123abc` starts with a digit → number → numbers allow only digits.
Python reports `SyntaxError: invalid decimal literal`; C reports `invalid
suffix "abc" on integer constant`. Snek now does the same (how, in DFA terms:
§8.1 `BAD_NUMBER`).

### 5.7 Input tape
The textbook picture of a DFA: a strip of cells, one character each, and a
read head that moves one cell right per consumed character.
```
 ┌─┬─┬─┬─┬─┬─┬─┬─┬─┬─┐
 │l│e│t│ │x│ │=│ │5│;│
 └─┴─┴─┴─┴─┴─┴─┴─┴─┴─┘
          ▲ head
```
When a token ends on a character with no move, the head **stays** — making
"not consumed / lookahead" visible without extra UI.

### 5.8 Character classes (edge labels)
The DFA doesn't have one edge per character; characters are grouped into
classes (`letter` = `a–z A–Z _`, `digit` = `0–9`, …). Σ in the 5-tuple is the
set of classes. Edges show the actual set; hover shows the class name.

### 5.9 Two pictures of the parser as a PDA
**(A) Call graph** — one node per grammar rule; an edge means "this rule
calls that rule"; the stack holds rules in progress. Formal name: recursive
transition network. Intuitive, but not what a textbook calls a PDA.

**(B) Textbook PDA** (CFG → PDA construction, Sipser/Hopcroft) — essentially
one state; the stack holds grammar symbols still *expected* (rules and
tokens). Two moves: **expand** (top is a rule → replace it by its right-hand
side) and **match** (top is a token equal to the next input → pop it, read
the input). Accept when the input is fully read and the stack is empty.
```
stack (top left)          input        move
Program                   let x = 5 ;  expand
LetStmt                   let x = 5 ;  expand
let IDENT = Expr ;        let x = 5 ;  match let
IDENT = Expr ;            x = 5 ;      match x
= Expr ;                  = 5 ;        match =
Expr ;                    5 ;          expand … → NUMBER
NUMBER ;                  5 ;          match 5
;                         ;            match ;
(empty)                   (empty)      ACCEPT
```
Choice: (B) main view, (A) secondary tab.

### 5.10 BNF vs EBNF
`Statement*` ("zero or more") and `( else Block )?` ("optional") are EBNF
shorthand. A formal CFG only allows rules `A → symbols | symbols`, so
repetition becomes recursion: `StmtList → Statement StmtList | ε`. Same
language; the textbook PDA needs the pure form because it expands one rule at
a time.

### 5.11 The skipped `Expr`
The grammar says `Expr → Equality`, but the current parser jumps from
LetStmt straight to Equality in the trace. Visualization disagreeing with the
grammar = plot hole. Fixed: every symbol is traced.

### 5.12 Parse tree vs AST, and why it lives in Phase 2
Accepting a program proves it can be derived from the grammar; the proof is
a **parse tree** (root Program, children = what each rule expanded to,
leaves = tokens). The **AST** is the trimmed version (drops `;` `=`, collapses
do-nothing chains like `Equality → … → Primary`). The tree is Phase 2's
*output*, just as tokens are Phase 1's; Phases 3–4 walk the AST, so it must
be shown where it is built.
```
Program
└─ Statement
   └─ LetStmt
      ├─ let
      ├─ IDENT (x)
      ├─ =
      ├─ Expr → … → Primary → NUMBER (5)
      └─ ;
AST:  Let(x, Number 5)
```

### 5.13 Leftmost derivation
The tree written as text, rewriting the leftmost non-terminal each step:
`Program ⇒ LetStmt ⇒ let IDENT = Expr ; ⇒ … ⇒ let x = 5 ;`. A top-down parser
produces exactly this. With the textbook PDA it's free: **tokens matched so
far + current stack = current sentential form.**

### 5.14 FIRST sets, LL(1), the parse table
To pick a rule, the parser looks at the next token (lookahead). FIRST(X) =
tokens that can start X. **LL(1)** = read Left-to-right, build a Leftmost
derivation, 1 lookahead token always suffices because alternatives' FIRST
sets are disjoint → the PDA is **deterministic** (never guesses). The
current grammar has one exception: `AssignStmt` and `ExprStmt` both start
with IDENT, so it peeks 2 tokens there (LL(2)). The extended grammar removes
that by **left-factoring** (§7.3). The LL(1) table is a grid (non-terminal ×
lookahead token) → production.

Formal note (no hidden gap): a PDA has no "peek". A lookahead-driven PDA is
equivalent to one that reads the token into its finite control and then
chooses — so "deterministic PDA with 1 lookahead" is legitimate.

### 5.15 Dotted rules
`LetStmt → let IDENT • = Expr ;` — the dot marks how far into the rule the
parser is: everything left of it matched, `=` expected next.

### 5.16 EOF and lookahead window
EOF is the end-of-input token (`$` in textbooks). It was hidden, so at the
final step nothing was highlighted — fixed. The 2-token window is no longer
needed (grammar is LL(1) after left-factoring).

### 5.17 Numbers
JS numbers are 64-bit floats, exact only to 2⁵³. Snek uses `BigInt` —
unbounded integers, which is also what makes the "Snek is Turing-complete"
claim honest. `7 / 2 = 3` (truncating integer division, Snek has only
integers). Division by zero is a runtime error and is never constant-folded
(the optimizer must not change *when/whether* an error happens).

---

## 6. Global UI decisions

- **Split screen stays:** left pane = phase view (zoom transitions confined to it); right = Code panel (Phases 1–3) → IR panel (Phases 4–7).
- **Scrubber area** = controls row + **2×2 explanation grid** (What happened / Why / Formal / Next), tight padding, ≤2 lines each. Every cell is always filled — no step may leave "Why" empty.
- **Intro card** per phase on zoom-in (dismissible, re-openable from a small `?`).
- **Glossary hovers** on ToC terms.
- **elkjs** for every graph → deterministic layered layout, orthogonal edges, no node/edge overlaps. Replaces the hand-placed `POSITIONS` + custom `RoutedEdge` gutter routing in `DfaGraph.tsx` / `PdaGraph.tsx`.
- **Chapters:** Phase 1 per token; Phases 2–7 per statement/function.
- **Flowchart:** 7 boxes; phase *n* enabled once phase *n−1* succeeded (not necessarily watched). Errors stop the pipeline at the failing phase, and later boxes show "blocked by error in phase n".
- **Error handling everywhere:** every phase's error keeps its partial trace playable up to the failure, error step in red, 2×2 grid explains it.
- All prose lives in `src/compiler/messages/` (one file per phase, plus shared glossary and intro-card files). Approved split; existing `messages.ts` text is moved verbatim.

---

## 7. Language extensions (Q62) — full spec

### 7.1 New tokens
`FN`, `RETURN`, `FOR` (keywords) · `STRING` · `AND` (`&&`), `OR` (`||`), `NOT` (`!`) · `COMMA` · `LBRACKET`, `RBRACKET`. `/` stops being single-char (it may start `/*`).

### 7.2 Lexer DFA state set (after all fixes)

| State | Accepting? | Action on accept | Notes |
|---|---|---|---|
| START | no | — | q₀ |
| IN_WHITESPACE | yes | discard | loops on space/tab/`\r`/`\n` |
| IN_LINE_COMMENT | yes | discard | after `#`, loops on anything except `\n` |
| IN_IDENT | yes | emit IDENT or keyword (keyword check step) | |
| IN_NUMBER | yes | emit NUMBER | on letter → BAD_NUMBER |
| BAD_NUMBER | yes | **lexical error** "invalid decimal literal" | loops on letter/digit (§8.1) |
| SINGLE | yes | emit kind by lexeme | `+ - * ( ) { } ; , [ ]` |
| SAW_EQ / SAW_LT / SAW_GT | yes | emit ASSIGN / LT / GT | on `=` → SAW_*_EQ |
| SAW_EQ_EQ / SAW_LT_EQ / SAW_GT_EQ | yes | emit EQ / LTE / GTE | (two-char operators get their own accepting state — replaces the old "consume `=` and jump to START" edge) |
| SAW_BANG | yes | emit NOT | on `=` → SAW_BANG_EQ |
| SAW_BANG_EQ | yes | emit NEQ | |
| SAW_AMP | no | — | on `&` → SAW_AMP_AMP; lone `&` = error |
| SAW_AMP_AMP | yes | emit AND | |
| SAW_PIPE | no | — | on `\|` → SAW_PIPE_PIPE; lone `\|` = error |
| SAW_PIPE_PIPE | yes | emit OR | |
| SAW_SLASH | yes | emit SLASH | on `*` → IN_BLOCK_COMMENT |
| IN_BLOCK_COMMENT | no | — | on `*` → BLOCK_STAR, else loop |
| BLOCK_STAR | no | — | on `/` → BLOCK_END; on `*` loop; else → IN_BLOCK_COMMENT |
| BLOCK_END | yes | discard | |
| IN_STRING | no | — | on `"` → STRING_END; `\` → STRING_ESC; newline → DEAD; else loop |
| STRING_ESC | no | — | on `n t " \` → IN_STRING; else → DEAD |
| STRING_END | yes | emit STRING | |
| DEAD | no | — | trap; self-loop on all Σ |

Σ (character classes): letter, digit, `=`, `<`, `>`, `!`, `&`, `|`, `/`, `*`, `"`, `\`, `#`, newline, whitespace, single (other single-char symbols), other.

Commit rule (explicit, not hidden): once IN_BLOCK_COMMENT is entered the
scanner does **not** back up to the earlier accepting SAW_SLASH — reaching
EOF inside a comment is the error "unterminated comment". Without this rule,
longest-match would silently re-lex `/* abc` as `SLASH STAR IDENT`. (Real
tokenizers make the same commitment.)

### 7.3 Extended grammar (EBNF shorthand)
```
Program        -> Decl* EOF
Decl           -> FuncDecl | Statement
FuncDecl       -> "fn" IDENT "(" Params? ")" Block
Params         -> IDENT ( "," IDENT )*

Statement      -> LetStmt | PrintStmt | IfStmt | WhileStmt | ForStmt
                | ReturnStmt | Block | ExprStmt
LetStmt        -> "let" IDENT "=" Expr ";"
PrintStmt      -> "print" Expr ";"
IfStmt         -> "if" "(" Expr ")" Block ( "else" Block )?
WhileStmt      -> "while" "(" Expr ")" Block
ForStmt        -> "for" "(" ForInit Expr? ";" SimpleStmt? ")" Block
ForInit        -> LetStmt | ExprStmt | ";"
ReturnStmt     -> "return" Expr? ";"
Block          -> "{" Statement* "}"
ExprStmt       -> SimpleStmt ";"
SimpleStmt     -> Expr ( "=" Expr )?

Expr           -> LogicOr
LogicOr        -> LogicAnd ( "||" LogicAnd )*
LogicAnd       -> Equality ( "&&" Equality )*
Equality       -> Comparison ( ("==" | "!=") Comparison )*
Comparison     -> Additive ( ("<" | ">" | "<=" | ">=") Additive )*
Additive       -> Multiplicative ( ("+" | "-") Multiplicative )*
Multiplicative -> Unary ( ("*" | "/") Unary )*
Unary          -> "-" Unary | "!" Unary | Postfix
Postfix        -> Primary ( "(" Args? ")" | "[" Expr "]" )*
Args           -> Expr ( "," Expr )*
Primary        -> NUMBER | STRING | IDENT | "true" | "false"
                | "(" Expr ")" | "[" Args? "]"
```

**Why `AssignStmt` disappears (left-factoring):** with arrays, `a[i] = 5;`
vs `a[i];` share an arbitrarily long prefix — no fixed lookahead `k` can tell
them apart, so the old `IDENT "="` rule would make the grammar not LL(k) for
any k. Left-factoring pulls the common prefix out: parse an `Expr` first, then
an optional `= Expr`. The grammar is now **LL(1) everywhere**. Price: the
grammar over-approximates (`1 = 2;` parses), and Semantic Analysis rejects
non-lvalue targets — itself a talking point ("grammar accepts a superset;
semantics narrows it"). The AST still has an `AssignStmt` node, built when
the optional `= Expr` is present.

`fn` only at top level (a `fn` inside a block is a parse error — `Decl` is
only reachable from `Program`).

### 7.4 Pure BNF (the official grammar shown in the UI)
Mechanical conversion: `X*` → fresh `XList → X XList | ε`; `X?` → fresh
`XOpt → X | ε`; `A ( op B )*` → `A ATail`, `ATail → op B ATail | ε`.
Helper non-terminals (`…List`, `…Opt`, `…Tail`) are flagged `helper` so views
can dim/fold them.
```
Program        -> DeclList EOF
DeclList       -> Decl DeclList | ε
Decl           -> FuncDecl | Statement
FuncDecl       -> fn IDENT ( ParamsOpt ) Block
ParamsOpt      -> Params | ε
Params         -> IDENT ParamsTail
ParamsTail     -> , IDENT ParamsTail | ε
Statement      -> LetStmt | PrintStmt | IfStmt | WhileStmt | ForStmt
                | ReturnStmt | Block | ExprStmt
LetStmt        -> let IDENT = Expr ;
PrintStmt      -> print Expr ;
IfStmt         -> if ( Expr ) Block ElseOpt
ElseOpt        -> else Block | ε
WhileStmt      -> while ( Expr ) Block
ForStmt        -> for ( ForInit ExprOpt ; SimpleOpt ) Block
ForInit        -> LetStmt | ExprStmt | ;
ExprOpt        -> Expr | ε
SimpleOpt      -> SimpleStmt | ε
ReturnStmt     -> return ExprOpt ;
Block          -> { StmtList }
StmtList       -> Statement StmtList | ε
ExprStmt       -> SimpleStmt ;
SimpleStmt     -> Expr AssignTail
AssignTail     -> = Expr | ε
Expr           -> LogicOr
LogicOr        -> LogicAnd LogicOrTail
LogicOrTail    -> || LogicAnd LogicOrTail | ε
LogicAnd       -> Equality LogicAndTail
LogicAndTail   -> && Equality LogicAndTail | ε
Equality       -> Comparison EqualityTail
EqualityTail   -> EqOp Comparison EqualityTail | ε
EqOp           -> == | !=
Comparison     -> Additive ComparisonTail
ComparisonTail -> CompOp Additive ComparisonTail | ε
CompOp         -> < | > | <= | >=
Additive       -> Multiplicative AdditiveTail
AdditiveTail   -> AddOp Multiplicative AdditiveTail | ε
AddOp          -> + | -
Multiplicative -> Unary MultiplicativeTail
MultiplicativeTail -> MulOp Unary MultiplicativeTail | ε
MulOp          -> * | /
Unary          -> - Unary | ! Unary | Postfix
Postfix        -> Primary PostfixTail
PostfixTail    -> ( ArgsOpt ) PostfixTail | [ Expr ] PostfixTail | ε
ArgsOpt        -> Args | ε
Args           -> Expr ArgsTail
ArgsTail       -> , Expr ArgsTail | ε
Primary        -> NUMBER | STRING | IDENT | true | false | ( Expr ) | [ ArgsOpt ]
```
LL(1) spot-checks (verified by hand; the app also computes FIRST/FOLLOW and
reports conflicts at startup in dev): `ForInit` alternatives start with
`let` / an expression token / `;` — disjoint. `ExprOpt` ε-choice is safe
because FOLLOW = {`;`, …} contains no expression-start token. `ArgsOpt`
FOLLOW = {`)`, `]`}. `Statement`'s `Block` starts with `{`, and no expression
starts with `{`.

**Associativity (no hidden gap):** the `…Tail` form makes the *parse tree*
right-leaning (`1 - 2 - 3` hangs to the right). The *AST* is built
left-associative (`(1 - 2) - 3`) by folding each Tail left-to-right. The
Formal cell says this explicitly when a Tail is folded.

### 7.5 Types, scopes, functions (rules Semantic Analysis enforces)
- **Types:** `int`, `bool`, `string`, `array<T>`, `fn(n)`, and `unknown`.
- Snek has no type annotations, so types are **inferred locally**: a
  variable's type is fixed by its `let` initializer. Function parameters,
  function results, and empty array literals `[]` are `unknown`. Expressions
  involving `unknown` pass static checks and are checked by the VM at run
  time. ToC justification (said in the UI): exact static typing of arbitrary
  programs is undecidable (Rice), so every compiler checks a decidable
  approximation; Snek's is "what is knowable from literals and declarations".
- **Operators:** `+` int×int→int, string×string→string (no implicit
  conversion). `- * /` int only. `< > <= >=` int only. `== !=` same type,
  scalars only (int, bool, string). `&& || !` bool only. `if`/`while`/`for`
  conditions must be bool (`if (5)` is an error). `print` accepts any type.
  Indexing: `array<T>[int] → T` (strings not indexable). Array literals must
  be homogeneous.
- **Assignment:** target must be an lvalue (`IDENT` or `x[i]`); a known type
  must match the variable's type; a string element can't be assigned.
- **Scopes:** lexical block scope. `{` pushes a scope, `}` pops it. Shadowing
  an outer name is allowed; redeclaring in the same scope is an error. Each
  function body is a scope containing its parameters.
- **Functions:** declared only at top level. **Hoisted** (pass 1 collects all
  function names first) so functions can call each other in any order,
  including recursion. A function body sees **only** its parameters, its own
  locals, and function names — not top-level `let` variables. (Reason:
  hoisted functions + later globals would make "is this global declared
  yet?" depend on call order at run time, which is not statically decidable
  in general; the restriction keeps name resolution purely lexical.)
  Functions are not first-class: only a name that refers to a function may be
  called. Arity is checked statically. `return` outside a function is an
  error. A function that falls off the end (or `return;`) produces a *no
  value* result; using it in an expression is a runtime error.
- **`for`** is **desugared** in Phase 4 into
  `{ init; while (cond) { body; update; } }` (missing cond = `true`). The
  Phase 4 narration shows the rewrite — a classic "syntactic sugar" talking
  point.

---

## 8. Phase 1 plan — Lexical Analysis (fixes + UI)

### 8.1 Engine
- `dfa.ts`: new state set (§7.2), δ with **no ε / reject pseudo-classes**, explicit `ACCEPTING: Record<State, AcceptAction>` where `AcceptAction = { emit: TokenKind | "byLexeme" | "identOrKeyword" } | "discard" | { error: string }`, and a `deltaTotal(state, cls)` that returns DEAD for undefined pairs.
- `lexer.ts` = textbook longest-match driver: run δ from START, remember the last accepting state + position, stop when the next move is DEAD (or at EOF), back up to the last accept, perform its action, restart. Commit rule for block comments (§7.2).
- `BAD_NUMBER`: `IN_NUMBER –letter→ BAD_NUMBER` (accepting, action = error, loops on letter/digit). Longest match prefers it because it's longer than the NUMBER prefix, so `123abc` hits the error action — this is exactly how lexer generators encode "reject this pattern" (a longer error pattern wins).
- Trace step kinds (`DfaStep.kind`): `move` (consume char), `no-move` (char has no transition — head stays, highlighted as lookahead), `accept-emit`, `accept-discard`, `keyword-check`, `error`, `eof`.
- `LexError` partial trace is kept and playable (fix `app.tsx`).

### 8.2 UI (lexical view)
- **Top:** input tape (current line, head marker).
- **Center:** elkjs DFA graph — circles, double circles for accepting states (colour-coded by action: emit / discard / error), start arrow, DEAD with "all undefined pairs" note; DEAD edges drawn only when taken.
- **Left overlay:** full δ table (state × class → state) with the active **(state, class)** cell highlighted (fixes bug 7).
- **Right overlay:** 5-tuple panel (Q, Σ, δ → "see table", q₀, F with actions) above the emitted-tokens list.
- **Scrubber:** per-token chapters (comments/whitespace get their own chapters too).
- **2×2 grid example** for `x+` at the `+` no-move step:
  - *What:* `IN_IDENT` has no transition on `'+'`; the head stays on `'+'`.
  - *Why:* longest match — `"x"` is the longest prefix the DFA accepts; `'+'` can't extend an identifier.
  - *Formal:* δ(IN_IDENT, single) = DEAD ⇒ back up to last accept (IN_IDENT ∈ F).
  - *Next:* emit IDENT `"x"` (after keyword check), restart at START on `'+'`.

---

## 9. Phase 2 plan — Syntax Analysis (fixes + UI)

### 9.1 Engine — one source of truth
**Change from today:** the hand-written recursive-descent parser is replaced
by a **table-driven LL(1) PDA** generated from grammar data.

- New `grammar.ts`: the pure-BNF grammar (§7.4) as data (productions, `helper` flags), plus the EBNF text for display. `GRAMMAR_RULES` in `messages.ts` is then derived from it instead of mirrored by hand (removes a whole class of drift bugs like the missing `Block`).
- `ll1.ts`: computes FIRST, FOLLOW, the LL(1) table; reports conflicts (must be none).
- `parser.ts`: the PDA itself — stack of grammar symbols, `expand` / `match` moves driven by the table, building the **parse tree** as it expands. Trace step = `{ move: "expand"|"match"|"accept"|"error", production?, stackAfter, lookahead, treeNodeId }`.
- `ast.ts` builder: parse tree → AST (folds `…Tail` left-associatively, drops punctuation, collapses chains, turns `SimpleStmt` with `AssignTail` into `AssignStmt`, `ForStmt` kept as-is until Phase 4 desugars it).
- `pda.ts` call graph (view A) is **derived**: the call-stack at any moment = the ancestors of the parse-tree node being expanded; helper non-terminals fold into their parent. So a missing edge like `Unary → Unary` can't happen again — edges come from the grammar.
- Why replace recursive descent: two engines (recursive descent for the AST + a separate PDA for the view) could disagree; one table-driven PDA *is* the textbook deterministic PDA, and everything else is derived from its trace. Recursive descent is still named in the Why cell as the equivalent hand-written form ("each non-terminal's function call = an expand; its return = the point where that rule's symbols are all matched").
- `ParseError` carries the partial trace and the expected set (the LL(1) row's non-empty columns).

### 9.2 Acceptance
Final steps: `match EOF ($)`, then **ACCEPT — input fully read and stack
empty** (acceptance by empty stack; stated in the Formal cell).

### 9.3 Narration fixes
- Remove "already confirmed to exist"; replace with the Semantic-Analysis pointer (Q40).
- Every step's Formal cell cites the exact production or table cell: `M[Statement, let] = Statement → LetStmt`.

### 9.4 Ambiguity story (Q38)
- **No dangling else:** `if` requires a `Block`, so `else` always belongs to the nearest `}` — only one parse tree exists.
- **Precedence** by layering (`LogicOr` above … above `Unary`): a lower rule binds tighter because it's expanded deeper.
- **Associativity** handled in the AST fold (§7.4).
- **LL(1) ⇒ unambiguous:** a grammar with a conflict-free LL(1) table has at most one leftmost derivation per input.

### 9.5 UI (syntax view)
- **Top strip:** leftmost derivation (matched tokens │ stack contents).
- **Left, wide pane — tabs:** `Parse tree` (default; elkjs tree growing live, helper nodes dimmed, ε leaves shown; toggle → AST) · `LL(1) table` (current cell highlighted) · `Call graph` (view A, elkjs, with dotted-rule frame list — Q42) · `Grammar` (BNF / EBNF toggle, current production highlighted).
- **Right, narrow column — "PDA configuration":** the formal configuration (state, remaining input, stack): stack of grammar symbols (top highlighted), then the token list with EOF and the current lookahead highlighted.
- **Scrubber:** per-statement chapters.

---

## 10. Phase 3 plan — Semantic Analysis

### 10.1 What it computes
Symbol table (scope stack), a type for every expression node, resolved slot
index for every variable (used by Phase 4), errors.

### 10.2 Algorithm (two passes over the AST)
1. **Pass 1 (hoist):** collect all `fn` names and arities into the global scope.
2. **Pass 2 (walk):** depth-first walk. Steps: `enter-scope`, `declare`, `resolve` (lookup walks the scope stack top-down), `type-check` (rule from §7.5), `assign-slot`, `exit-scope`, `error`.

### 10.3 UI
- **Left pane:** AST (elkjs), current node highlighted, each checked node gets a type badge (`int`, `bool`, …, `?` for unknown). **Side column:** symbol-table stack — one card per open scope with `name : type @slot`; push/pop animated.
- **Right:** code panel, span of the current node highlighted (AST nodes gain `line/col/endCol` spans from Phase 2).
- **2×2 example** at `x + true`: *What:* checking `+` with operands int, bool. *Why:* `+` is defined only for int×int or string×string. *Formal:* Γ ⊢ x : int, Γ ⊢ true : bool, no rule for `+ : int × bool` ⇒ type error. *Next:* compilation stops; later phases are blocked.
- **Intro card:** why this phase exists — `{ w c w }` is not context-free (pumping-lemma sketch), and "declare before use" has the same shape (the declared name must reappear later), so no CFG/PDA can check it; a symbol table can.

---

## 11. Phase 4 plan — AST → Instructions

### 11.1 Instruction set (CPython-inspired, stack machine)
| Instruction | Stack effect | Meaning |
|---|---|---|
| `LOAD_CONST k` | → v | push constant `k` |
| `LOAD_FAST s` / `STORE_FAST s` | → v / v → | read/write local slot `s` |
| `LOAD_GLOBAL f` | → fn | push function `f` |
| `BINARY_OP op` | a b → r | `+ - * /` |
| `COMPARE_OP op` | a b → bool | `== != < > <= >=` |
| `UNARY_NEGATIVE` / `UNARY_NOT` | a → r | `-a` / `!a` |
| `BUILD_LIST n` | n items → array | array literal |
| `BINARY_SUBSCR` / `STORE_SUBSCR` | a i → v / v a i → | index read / write |
| `CALL n` | fn args… → r | call with `n` args |
| `RETURN_VALUE` | v → | return from function (main: halt) |
| `PRINT` | v → | Snek-specific (CPython calls `print` as a function; noted in UI) |
| `POP_TOP` | v → | discard expression-statement value |
| `JUMP_FORWARD L` / `JUMP_BACKWARD L` | — | unconditional (backward = loops) |
| `POP_JUMP_IF_FALSE L` | c → | branch |
| `JUMP_IF_FALSE_OR_POP L` / `JUMP_IF_TRUE_OR_POP L` | c → c? | short-circuit `&&` / `\|\|` (CPython ≤3.11 names, kept for clarity) |

Each function is its own code object; top-level code is the `main` code
object. Slot numbers come from Phase 3 (shadowed variables get distinct
slots).

### 11.2 Translation rules (syntax-directed translation, shown in Formal cell)
`BinaryExpr(op, l, r)` ⇒ code(l) · code(r) · `BINARY_OP op` (post-order:
operands first, operator last — why a stack machine needs no registers).
`IfStmt` ⇒ code(cond) · `POP_JUMP_IF_FALSE L_else` · code(then) ·
`JUMP_FORWARD L_end` · `L_else:` code(else) · `L_end:`.
`WhileStmt` ⇒ `L_top:` code(cond) · `POP_JUMP_IF_FALSE L_end` · code(body) ·
`JUMP_BACKWARD L_top` · `L_end:`. `ForStmt` ⇒ desugar step, then `WhileStmt`.
`a && b` ⇒ code(a) · `JUMP_IF_FALSE_OR_POP L` · code(b) · `L:` — why
short-circuiting needs a jump.

### 11.3 Visualization
- **Left pane:** AST, post-order walk; node highlights when *entered*, emits when *finished*. Jumps first emitted with target `?` (backpatch list shown), patched when the label is reached — visible `? → 7`.
- **Right panel — the visual conversion (Q5):** at zoom-in the right panel splits: top = source (code panel), bottom = IR panel. As each statement is translated, its source line dims and its instruction block slides into the IR list. When the phase completes, the source half collapses and the IR panel owns the right side for Phases 5–7.
- **2×2 example** at `BINARY_OP +` for `x + 3`: *What:* emitted `BINARY_OP +`. *Why:* both operands are already on the stack (post-order), so the operator comes last. *Formal:* code(l+r) = code(l) · code(r) · BINARY_OP +. *Next:* return to parent `LetStmt`, which emits `STORE_FAST x`.

---

## 12. Phase 5 plan — Control-Flow Graph + Optimize

### 12.1 Build the graph (animated)
1. **Leaders:** first instruction; every jump target; every instruction after a jump/return.
2. **Basic blocks:** leader up to (not including) the next leader.
3. **Edges:** fall-through, jump target; conditional jumps get a true and a false edge.

### 12.2 Optimizations (fixpoint loop, each rewrite = one step with diff + reason)
1. **Constant folding** — `LOAD_CONST a; LOAD_CONST b; BINARY_OP op` ⇒ `LOAD_CONST (a op b)`; never folds `/ 0`.
2. **Constant propagation (block-local)** — after `LOAD_CONST c; STORE_FAST s`, later `LOAD_FAST s` in the same block ⇒ `LOAD_CONST c`, until `s` is stored again. Global propagation needs dataflow analysis (reaching definitions) — deliberately out of scope, and the UI says so.
3. **Branch folding** — `LOAD_CONST true/false; POP_JUMP_IF_FALSE L` ⇒ `JUMP_FORWARD L` or nothing; the untaken edge is removed.
4. **Dead-code elimination** — BFS from the entry block; blocks not reached are deleted.
5. **Peephole** — `LOAD_CONST; POP_TOP` removed; jump to the next instruction removed; jump-to-jump threaded.

Repeat until nothing changes. **Termination argument** (shown): every rewrite
either removes instructions or replaces a `LOAD_FAST` with a `LOAD_CONST`;
both can happen only finitely often, so the loop halts.

Honesty note in the UI: CPython does its folding partly on the AST and partly
in its flow-graph pass (`ast_opt.c`, `flowgraph.c`); Snek does all of it on the
IR so every optimization is visible in one phase.

### 12.3 UI
- **Left pane:** elkjs block graph (true = green, false = red, back-edges dashed); removed blocks fade out; rewritten instructions shown struck-through → new.
- **Right:** IR panel, instructions coloured by block.

### 12.4 Decidability panel (Q56)
Shown at the DCE step (Formal + Why cells, plus intro card):
- "Will this block ever run?" in general = a non-trivial semantic property ⇒ **undecidable** (Rice's theorem; reduces from the halting problem).
- What Snek removes is **graph-unreachable** code (no path from entry) — plain BFS, decidable — plus branches whose condition folded to a constant.
- So the optimizer is *sound but incomplete*: it never removes live code, and it can't remove all dead code.

---

## 13. Phase 6 plan — Bytecode Emission

- **Assembly:** labels → relative jump offsets in instruction units (like CPython 3.12's `JUMP_FORWARD` / `JUMP_BACKWARD` / `POP_JUMP_IF_FALSE`). Each instruction = 2 bytes (opcode, arg), CPython-style wordcode; args > 255 use an `EXTENDED_ARG` prefix.
- **Per code object:** `co_code` (bytes), `co_consts`, `co_varnames`, `co_names`, and a line table (instruction → source line).
- **Opcode numbers:** a Snek-defined table (documented; not CPython's numbers).
- **UI — left pane:** constants / names / varnames tables filling in; label-resolution list (`L_end → +4`). **Right:** IR panel switches to a `dis`-style table (line, offset, opname, arg, resolved value) with a hex byte row under each instruction.
- **2×2 example** at a jump: *What:* `POP_JUMP_IF_FALSE L_else` → bytes `2C 03`. *Why:* the VM needs a number, not a label; the target is 3 instructions ahead. *Formal:* offset = index(L_else) − index(next instruction). *Next:* encode the next instruction.

---

## 14. Phase 7 plan — Execution (VM)

### 14.1 Machine
Fetch–decode–execute loop over `co_code`: program counter, operand stack,
call-frame stack (each frame: code object, PC, locals), output console.
Values: `BigInt`, bool, string, array, function, *no value*.

### 14.2 Runtime errors
Division by zero, index out of range, type error on an `unknown` operand, use
of a *no value* result, step cap (10 000 instructions), frame cap (256 —
unbounded recursion).

### 14.3 UI
- **Left pane:** operand stack · call-frame stack · locals of the top frame · console output.
- **Right:** `dis` listing with PC highlighted.
- **Scrubber:** per-statement chapters (via the line table).

### 14.4 Theory framing (Q60–61)
- The VM is a **universal machine**: the program is *data* it interprets (like a universal TM reading another TM's description).
- With unbounded integers and `while`, Snek is **Turing-complete**. One stack = PDA power; the VM effectively has two (operand + frames) plus unbounded memory = TM power.
- Therefore **halting is undecidable**: when the step cap trips, the message is "Stopped after 10 000 steps — no algorithm can decide in general whether a program halts (halting problem), so the VM uses a budget instead."

---

## 15. Demo program and timing (15–20 min)

Curated `demo.snek` (every feature, short enough to play through):
```
# demo.snek
fn square(n) {
  return n * n;
}
let limit = 1 + 2;          /* folded to 3 in Phase 5 */
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
if (false) { print "never"; }   # removed as dead code
```
Error demos (one line each, loaded when asked): `let x = 123abc;` (lexical),
`let = 5;` (syntax), `let y = x + true;` (semantic), `print 1 / 0;` (runtime),
`while (true) { }` (step cap / halting).

| Segment | Time |
|---|---|
| Intro: flowchart + Chomsky ladder | 1.5 min |
| Phase 1 Lexing (play one line fully, skip rest by chapters) | 3 min |
| Phase 2 Parsing (one statement fully; show LL(1) table, parse tree → AST) | 4 min |
| Phase 3 Semantic (scope stack, one type error) | 2 min |
| Phase 4 IR (the `for` desugar, one backpatch) | 2.5 min |
| Phase 5 Control-flow graph + optimize (fold, DCE, Rice) | 2.5 min |
| Phase 6 Bytecode (one jump encoding) | 1.5 min |
| Phase 7 VM (run to output; show step-cap demo) | 2 min |
| **Total** | **19 min** |

---

## 16. PPT plan (for the teammate)

Built **last**, from the finished app. Screenshots: take them at the steps
named below on `demo.snek`, dark theme, laptop resolution. Each slide: one
idea, one visual, ≤3 bullets. Speaker notes = the "Why" lines from the app.

| # | Slide | Content | Visual |
|---|---|---|---|
| 1 | Title | Ouroboros — watching a compiler think, one automaton at a time | Logo + flowchart |
| 2 | Why a toy language | Same phases as CPython, every state fits on screen (§5.5) | Snek vs CPython grammar size |
| 3 | The pipeline | 7 phases, input → output of each (§1) | Flowchart screenshot |
| 4 | Chomsky ladder | Which machine each phase needs, and why the next phase exists (§2) | Ladder diagram |
| 5 | The language | Tokens, keywords, sample program | `demo.snek` |
| 6 | Lexing = DFA | 5-tuple; longest match; no ε (§5.1) | DFA graph at the `x+` no-move step |
| 7 | Lexing details | DEAD/total δ, keyword check, `123abc` error (§5.2–5.6) | δ table + error replay |
| 8 | Parsing = PDA | Grammar (BNF vs EBNF), textbook PDA expand/match (§5.9–5.10) | PDA configuration + derivation strip |
| 9 | LL(1) | FIRST sets, parse table, left-factoring of assignment (§5.14, §7.3) | LL(1) table with highlighted cell |
| 10 | Parse tree → AST | Output of Phase 2; ambiguity/precedence/associativity (§9.4) | Parse tree / AST toggle |
| 11 | Semantic analysis | Beyond context-free: `{ w c w }`; scopes; types (§10) | Scope stack + type error |
| 12 | IR generation | Syntax-directed translation, post-order, backpatching, `for` desugar (§11) | Split code → IR panel |
| 13 | Control-flow graph + optimize | Leaders/blocks; folding, propagation, DCE, peephole; termination (§12) | Block graph before/after |
| 14 | Decidability | Rice's theorem; sound but incomplete optimizer (§12.4) | Rice panel |
| 15 | Bytecode | Wordcode, relative jumps, `dis` view (§13) | `dis` table + hex |
| 16 | Execution | VM as universal machine; Turing-complete; halting and the step cap (§14) | VM view + step-cap message |
| 17 | Demo | Live walk-through (§15 script) | — |
| 18 | Summary | One line per phase: machine, why it's enough, why it isn't | Ladder recap |
| 19 | Q&A | — | — |

---

## 17. Implementation order

Follows Q67 (fix Phases 1–2 first) and the CLAUDE.md "Extending the language"
order. Each step ends with the rules.md verification (`node … tsc -b --force`,
`node … vite.js build`) and a stop-and-report (rules.md "ask before moving
on").

0. **User action:** install elkjs yourself (`npm install elkjs`) — the agent may not run npm (rules.md).
1. Docs sync: `snek-grammar.md` → extended EBNF + pure BNF (§7.3–7.4); fix stale paths in `compiler-phases.md`; update `checklist.md` with new roadmap items (after user approval — checklist order is binding).
2. Global UI shell: 2×2 explanation grid in scrubber, intro cards, glossary hover, elkjs layout helper, 7-box flowchart, error-blocked states.
3. Phase 1 engine (new DFA, longest-match driver, step kinds) + UI (tape, total δ table, 5-tuple, graph via elkjs), including all new tokens (§7.1–7.2).
4. Phase 2 engine (`grammar.ts`, `ll1.ts`, table-driven PDA, parse tree, AST builder, derived call graph) + UI (§9.5).
5. Phase 3 semantic analysis + UI.
6. Phase 4 IR generation + split-panel conversion UI.
7. Phase 5 control-flow graph + optimizations + UI.
8. Phase 6 assembly/bytecode + UI.
9. Phase 7 VM + UI.
10. `demo.snek` + error demos; timing rehearsal.
11. PPT (teammate, §16).

**Consistency check** (the one runnable check per ponytail/rules): at dev
startup, `ll1.ts` asserts the LL(1) table has no conflicts, and a small
fixture set (`demo.snek` + each error demo) asserts the expected
accept/reject verdict and error phase. Runs in-browser in dev mode — no test
runner, no npm script needed.

## 18. Resolved items (formerly open)
- **Split `messages.ts`: approved.** `src/compiler/messages/` gets one file per phase plus shared files; existing text is moved verbatim (copied, not regenerated). rules.md updated.
- **Checklist update: approved.** New sections added to `docs/checklist.md` in §17 order; the old sections are kept unchanged.
- **PPT content first:** the user moved slide content ahead of implementation — see `docs/ppt.md`. Screenshots are still captured last, from the finished app.
