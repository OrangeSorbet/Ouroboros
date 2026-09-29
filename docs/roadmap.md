# Ouroboros — language & UI roadmap

Status: **planned** (written 2026-09-29, before any milestone code).
Order of work: **M5 → M1 → M2 → M3 → M4**. Each milestone is finished —
all seven `scripts/check-*.ts` green, `tsc -b --force` clean, `vite build`
ok, samples added, `docs/ouroboros-grammar.md` updated — before the next one
starts. Tick the boxes as work lands.

## 0. Rename (done)

The language used to be called "Snek", which already exists as a real
language. Project, app **and** language are now all **Ouroboros**; source
files use the `.orbs` extension.

- [x] `.snek` → `.orbs` (samples, upload filter, default filename)
- [x] `SnekType` → `OrbType`, `SnekLogo` → `OrbLogo`, `sneklogo.png` → `orblogo.png`
- [x] prose in code, messages, scripts, README, CLAUDE.md, docs
- [x] `docs/snek-grammar.md` → `docs/ouroboros-grammar.md`
- [ ] not renamed on purpose: the finished deck (`docs/ppt*`, Canva design) and
      the repo folder name `Snek/` — both are historical/outside the app

## Ground rules for every language milestone

A feature is only "in" when it flows through all 7 phases **and** is
explained. The pipeline per feature (same as CLAUDE.md §Extending):

1. `dfa.ts` + `tokens.ts` — new states / char classes / token kinds
2. `grammar.ts` — BNF; must stay **LL(1)** (`check-parse` fails on conflicts)
3. `ast.ts` + `astBuilder.ts`
4. `semantic.ts` + `semanticTypes.ts` — scope, types, static errors
5. `irgen.ts` + `irTypes.ts` — new IR ops
6. `optimize.ts` — what folds, what must never fold
7. `bytecode.ts` `OPCODE_NUM` + `vm.ts`
8. `messages/*.ts` — What / Why / Formal / Next for every new step kind and
   error; `messages/glossary.ts` for new ToC terms
9. `src/samples/*.orbs` + one assert case per phase in `scripts/check-*.ts`
10. `docs/ouroboros-grammar.md`

**ToC story stays intact.** New features grow the DFA (more states, still no
ε-moves) and the grammar (more productions, still a deterministic PDA). All
the new *rules* (privacy, abstract, overloads, inheritance cycles) are
context-sensitive, so they land in Phase 3 — exactly the `{wcw}` argument the
project already makes. Dynamic dispatch lands in Phase 7 — the compiler
cannot know which override runs (Rice), only the VM can.

**Naming theme.** Built-in collections get snake names. Primitive types and
OOP keywords stay conventional so programs stay readable.

| Concept | Ouroboros name | Literal |
|---|---|---|
| list (mutable, ordered) | **coil** | `[1, 2, 3]` (existing array syntax) |
| tuple (immutable, ordered) | **scale** | `@(1, "a", true)` |
| dictionary | **den** | `@{ "k": 1, "j": 2 }` |
| set | **clutch** | `@[1, 2, 2]` → `@[1, 2]` |

`@` introduces every non-coil literal. It must not be `#` (line comment) and
must not be a bare `{` — at statement start the parser could not tell a
block `{` from a den `{` with one token of lookahead.

---

## M5 — Responsive UI (first)

Goal: usable from 360 px phones to desktop, no horizontal page scroll,
nothing hidden behind absolute-positioned chrome.

### Current state
- Layout is almost entirely **inline styles** (`app.tsx` `renderLeftPane`,
  root flex row, fixed `100vh`, absolute Navbar / back buttons / scrubber).
  Media queries cannot override inline styles, so layout-critical containers
  must move to CSS classes.
- `app.css` still carries Vite template leftovers (`.counter`, `.hero`,
  `#center`, `#next-steps`, `#docs`, `#spacer`, and `#root { width: 1126px }`).
- `index.css` only drops the root font size at 1024 px.

### Breakpoints
| Width | Layout |
|---|---|
| > 1024 px | today's layout: phase view left, side panel right |
| 641–1024 px | column: phase view on top, side panel below at ~40 dvh, resizable/collapsible |
| ≤ 640 px | one pane at a time: `View \| Code` toggle; side panel becomes full-screen tab |

### Work items — done 2026-09-29
- [x] Vite boilerplate deleted from `app.css` (only the keyframes remain).
- [x] `hooks/useMedia.ts` (`PHONE` query) + responsive rules at the end of
      `styles/layout.css`. Layout is overridden from CSS with `!important`
      on classes (`app-root`, `side-dock`, `dock-bar`, `dock-body`,
      `rsp-row`, `rsp-side`, `rsp-grid3`, `col-resize`) so views keep their
      inline styles; `100vh` → `100dvh`/`100%`.
- [x] Stacked layout (phone, or tablet in portrait): side panel docks under
      the phase view at 42 dvh with a collapse bar; collapsed by default on
      phones. Side panels fill the dock via `width/height: 100%`.
- [x] Navbar compact on phones (smaller logo, no filename/token count,
      short "Sample…" / "Upload" labels); back/intro row moves up to match.
- [x] Scrubber: 36 px touch buttons on phones (`scrubberHeight(phone)`),
      `touch-action: none` on both sliders, meta text ellipsizes; the 2×2
      explanation grid becomes What/Why/Formal/Next tabs on phones (same
      height; text scrolls instead of clamping — touch has no tooltip).
- [x] `PhaseFlowchart`: single column on phones; both layouts scale down
      to fit the pane (ResizeObserver).
- [x] `ElkGraph`: two-finger pinch zoom (one finger still pans).
- [x] Phone views: lex/parse/semantic/call-graph side columns stack under
      the main pane; VM and bytecode 3-column card grids become one column.
- [x] Verified with headless Chrome at 360×740, 390×844, 768×1024 and
      1440×900: no horizontal overflow in flowchart, lex, parse, semantic, VM.
- Known ceiling: landscape phones (~390 px tall) leave little room for the
  phase view under navbar + scrubber; add a collapsible scrubber if needed.

---

## M1 — Numbers, `%`, `none`, built-ins

**Status: done 2026-09-29.** Shared run-time semantics live in
`src/compiler/values.ts` (VM and constant folder both call it). Differences
from the plan below: `none` became a first-class value (store / pass /
compare / print; only computing with it is an error), and `none` is
type-compatible with anything in Phase 3. `check-vm` now runs every sample
and asserts where each `err-*` stops.

### Language
```
let pi = 3.14;
let r = 2;
print pi * r * r;      # 12.56 — int·float → float
print 17 % 5;          # 2
let nothing = none;
print len("hiss");     # 4
print str(42) + "!";   # string concat
print int(3.9);        # 3 (truncates)
print float(3);        # 3.0
```

### Per phase
- **Lex:** `IN_NUMBER --'.'--> IN_FRAC_DOT` (not accepting) `--digit--> IN_FLOAT`
  (accepting `FLOAT`). `3.` followed by a non-digit backs up to `NUMBER 3`
  (longest match), so `.` stays free for member access in M2/M3.
  `1.5abc` → `BAD_NUMBER`. New single-char tokens `%`, `.`, `:`, `@`
  (the last three used from M2). New keyword `none`.
- **Grammar:** `MulOp -> * | / | %`; `Primary -> … | FLOAT | none`.
- **Types:** `OrbType` gains `float`, and `none` becomes a literal type.
  Rules: `int ⊕ int → int`, any float operand → `float` (implicit widening
  int → float is the *only* conversion); `%` int-only; `+` on `str × str`
  is concat (check first whether it already exists); `str + int` is still an
  error — use `str(x)`.
- **Built-ins:** `len`, `str`, `int`, `float` resolved in Phase 3 as known
  names with fixed arity (like functions, but no code object). Shadowing a
  built-in with `let len = …` is allowed (inner scope wins); redeclaring at
  global scope is the normal redeclare error.
- **IR / bytecode:** `BINARY_MOD`; `CALL_BUILTIN name argc`.
- **Opt:** fold float arithmetic and `%`; never fold `x / 0`, `x % 0`,
  `x / 0.0`.
- **VM:** int = `bigint`, float = JS `number`; mixed op converts the bigint.
  Printing: floats always show a dot (`3.0`). `/` on ints still truncates;
  `%` sign follows the dividend (like C, not Python).
- **Samples:** `arith.orbs` (precedence, left-assoc, unary minus, `%`,
  folding), `floats.orbs`, plus the earlier small demos: `scopes.orbs`
  (reassign vs shadow), `loop.orbs`, `recursion.orbs`, `logic.orbs`,
  `err-redeclare.orbs`, `err-recursion.orbs` (frame cap 256).

---

## M2 — Collections: coil, scale, den, clutch

**Status: done 2026-09-29.** Run-time shapes in `src/compiler/heap.ts`;
VM heap panel shows reachable objects with ids (`coil #1`) and outlines the
ones the current instruction touched. Differences from the plan below:
method calls compile CPython-style as `LOAD_METHOD m` + `CALL n` (no
`CALL_METHOD`); coil also has `has(x)`; `remove` of an absent key is a
no-op; each call frame records its stack base so a `return` inside a
for-each drops the iterator; an equal key already present is kept
(`1` then `1.0` keeps `1`). Not done: folding constant scales in Phase 5
(skipped — no visible win for the demos).

### Language
```
let xs = [3, 1, 2];            # coil
xs.push(5);
print xs.pop();                # 5
let p = @(1, "one");           # scale
print p[1];                    # "one"
let ages = @{ "rex": 3, "kaa": 7 };  # den
ages["nag"] = 2;
print ages.has("kaa");         # true
print ages.keys();             # [ "rex", "kaa", "nag" ]
let seen = @[1, 2, 2];         # clutch → @[1, 2]
seen.add(3);
print seen.has(2);
for x in xs { print x; }       # for-each over coil / scale / clutch / den keys
```

### Grammar (LL(1)-checked)
```
Primary     -> … | @ AtLit
AtLit       -> ( ArgsOpt ) | [ ArgsOpt ] | { PairsOpt }
PairsOpt    -> Pairs | ε
Pairs       -> Expr : Expr PairsTail
PairsTail   -> , Expr : Expr PairsTail | ε
PostfixTail -> … | . IDENT PostfixTail
ForStmt     -> for ForRest
ForRest     -> ( ForInit ExprOpt ; SimpleOpt ) Block | IDENT in Expr Block
```
New keyword `in`. `x.f(…)` parses as member `f` then call — Phase 3 turns
that pair into a method call.

### Semantics
- Types: `coil<T>` (the current `array<T>` renamed), `scale<T1..Tn>`,
  `den<K, V>`, `clutch<T>`; unknown element types fall back to `unknown`.
- **Hashable keys** (den keys, clutch items): int, float, bool, str, none,
  and scales of hashables. A coil/den/clutch key is a static error when
  known, run-time error otherwise.
- Writing `p[0] = …` on a scale is a static error ("scales are immutable").
- Methods: coil `push pop len`, den `has keys values remove len`, clutch
  `add has remove len`; str `len`. Unknown method on a known type is a static
  error; on `unknown` it is checked by the VM.
- Equality: `==` is structural for scales, identity for coil/den/clutch.

### IR / bytecode / VM
- Ops: `BUILD_SCALE n`, `BUILD_DEN n`, `BUILD_CLUTCH n`, `LOAD_ATTR name`,
  `CALL_METHOD name argc`, `GET_ITER`, `FOR_ITER target`.
- `for x in e` desugars in IR to `GET_ITER` + `FOR_ITER` loop (like CPython),
  shown in the IR view as a desugar step just like the current `for`.
- VM values gain heap objects. den/clutch are JS `Map`/`Set` keyed by a
  canonical key string (`i:3`, `s:"rex"`, `t:(i:1,s:"a")`).
- **New VM visual: heap panel.** Stack/locals show references (`→#3`), the
  heap panel lists `#3 coil [3, 1, 2]` and highlights the object the current
  instruction touches. This teaches stack-vs-heap.
- Opt: `BUILD_*` of constants may fold into a constant **only for scales**
  (immutable); never for mutable collections.
- **Samples:** `coils.orbs`, `dens.orbs`, `clutch.orbs`, `err-scale-write.orbs`,
  `err-bad-key.orbs`.

---

## M3 — Classes, objects, inheritance, polymorphism

**Status: done 2026-09-29.** Differences from the plan below: no `NEW`,
`MAKE_CLASS` or `LOAD_SUPER_METHOD` opcodes — `new C(a…)` compiles to
`LOAD_GLOBAL C · args · CALL n` (calling a class builds an object, as in
Python) and `super.m(a…)` is resolved statically to `LOAD_GLOBAL Parent.m ·
LOAD_FAST 0 · args · CALL n+1`. Only `LOAD_ATTR` / `STORE_ATTR` are new.
Construction pushes the frames `init` (result replaced by the object) and
every class's `<fields>` initializer, root on top, so the frame stack shows
the whole constructor chain. The CALL step of a method call explains the
dispatch walk (`Snake.intro ✗ → Animal.intro ✓`). The grammar did not
pre-add the ε-only M4 hooks; M4 adds them.

### Language
```
class Animal {
  let name;
  let legs = 4;
  fn init(name) { self.name = name; }
  fn speak() { return "..."; }
  fn intro() { return self.name + " says " + self.speak(); }
}
class Snake : Animal {
  let legs = 0;
  fn speak() { return "hiss"; }
  fn intro() { return "(slithers) " + super.intro(); }
}
let pets = [new Animal("rex"), new Snake("kaa")];
for p in pets { print p.intro(); }   # dynamic dispatch picks speak()
```

### Grammar
```
Decl        -> FuncDecl | ClassDecl | Statement
ClassDecl   -> AbstractOpt class IDENT ParentOpt { MemberList }
ParentOpt   -> : IDENT | ε
MemberList  -> Member MemberList | ε
Member      -> VisOpt MemberBody
MemberBody  -> let IDENT FieldInit ; | fn IDENT ( ParamsOpt ) Block | AbstractFn
FieldInit   -> = Expr | ε
Primary     -> … | self | super . IDENT | new IDENT ( ArgsOpt )
```
(`AbstractOpt`, `VisOpt`, `AbstractFn` are ε-only until M4; they are in the
grammar from M3 so M4 is a pure additive change.) New keywords `class`,
`new`, `self`, `super`.

### Semantics (Phase 3)
- Hoist pass registers every class (name, parent, fields, methods) before
  the walk, like functions today, so declaration order does not matter.
- **Inheritance graph must be acyclic** — cycle detection over the parent
  edges (`class A : B {} class B : A {}` → error). Unknown parent → error.
- Field set = parent's fields + own; redeclaring a field in the *same* class
  is an error, overriding its default in a subclass is fine.
- Methods: override = same name and arity in a subclass (allowed).
  `self`/`super` outside a method → error. `super.f` with no parent `f` → error.
- `obj.f` on a known class with no field/method `f` → error; when the static
  class is unknown, the VM checks.
- `new C(args)`: arity must match an `init` (or zero args if none).
- Types: `obj<C>`; subclass instance is assignable where the parent is
  expected (subtyping, for the static checks that exist).

### IR / bytecode / VM
- Each class compiles to a **class record** in the bytecode program:
  `{ name, parent, fields, methods: {name → code object} }`; field defaults
  compile into a synthesized code object `C.<fields>(self)`.
- Ops: `NEW class argc` (alloc, run field inits root→leaf, call `init`),
  `LOAD_ATTR`, `STORE_ATTR`, `CALL_METHOD` (walk class chain = **dynamic
  dispatch**), `LOAD_SUPER_METHOD`.
- VM trace step for `CALL_METHOD` shows the lookup walk
  (`Snake.speak ✓` vs `Snake.intro ✗ → Animal.intro ✓`) — that walk is the
  vtable lesson.
- Heap panel (from M2) shows objects: `#5 Snake { name: "kaa", legs: 0 }`.
- Opt: never inline or fold across `CALL_METHOD` (target unknown statically).
- **Samples:** `classes.orbs`, `zoo.orbs` (polymorphism over a coil),
  `err-cycle.orbs`, `err-no-field.orbs`, `err-self.orbs`.

---

## M4 — Encapsulation, abstraction, overloading

**Status: done 2026-09-29.** As planned, plus: methods are keyed
`name/arity` everywhere (Phase 3 tables, `ClassInfo.methods`, VM dispatch),
so an override must match the arity; `init` overloads pick by `new`'s
argument count; objects in one collection widen to their nearest common
ancestor. The VM re-checks `priv` by the running code object's class
prefix (`Account.…`).

### Encapsulation
```
class Account {
  priv let balance = 0;
  fn deposit(n) { self.balance = self.balance + n; }
  fn get() { return self.balance; }
}
let a = new Account();
a.deposit(5);
print a.balance;     # Phase 3 error: balance is private to Account
```
- `VisOpt -> priv | ε`. `priv` members are visible only inside methods of
  the **same class** (not subclasses — keeps the rule one line). Checked
  statically when the receiver's class is known (`self.x` always is); the VM
  re-checks on `unknown` receivers so privacy cannot be bypassed.

### Abstraction
```
abstract class Shape {
  abstract fn area();
  fn describe() { return "area " + str(self.area()); }
}
class Circle : Shape {
  let r;
  fn init(r) { self.r = r; }
  fn area() { return 3.14 * self.r * self.r; }
}
```
- `AbstractOpt -> abstract | ε`; `AbstractFn -> abstract fn IDENT ( ParamsOpt ) ;`
- Errors: `new` of an abstract class; abstract method in a non-abstract
  class; concrete subclass that does not implement every inherited
  abstract method (checked after hoisting, walking the chain).

### Overloading (by arity)
```
fn add(a, b) { return a + b; }
fn add(a, b, c) { return a + b + c; }
print add(1, 2);      # picks add/2
print add(1, 2, 3);   # picks add/3
```
- Functions and methods may share a name if their **parameter counts
  differ**. Phase 3 stores them as `add/2`, `add/3` (name mangling, shown in
  the symbol table view) and resolves each call by argument count; same name
  + same count is still the redeclare error.
- Why only by count: Ouroboros has no type annotations and many types are
  only known at run time (Rice), so choosing an overload by argument *type*
  is not decidable at compile time. Count is always known from the syntax.
- `init` overloads work the same way (`new Circle()` vs `new Circle(2)`).

### Samples
`bank.orbs`, `shapes.orbs`, `overload.orbs`, `err-private.orbs`,
`err-abstract-new.orbs`, `err-missing-impl.orbs`, `err-overload.orbs`.

---

## After all milestones
- Update `README.md` language section, `docs/ouroboros-grammar.md`,
  `messages/intro.ts` phase cards and `docs/progress.md`.
- Refresh the headline numbers the deck quoted (`demo.orbs` tokens, PDA
  moves, 47→40 instructions) — they will change once the grammar grows.
