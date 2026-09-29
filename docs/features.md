# Ouroboros — feature list

Everything the app and the language can do, in one place. Ouroboros is both
the app (a step-by-step visualizer of a 7-phase compiler) and the language it
compiles (`.orbs` files). Full grammar and type rules:
[`ouroboros-grammar.md`](ouroboros-grammar.md). How features were added,
milestone by milestone: [`roadmap.md`](roadmap.md).

---

## 1. The language

### 1.1 Values and types

| Type | Example | Notes |
|---|---|---|
| `int` | `42`, `99999999999 * 99999999999` | unbounded (never overflows); `/` and `%` truncate toward zero |
| `float` | `3.14`, `7.0 / 2` | prints with a dot (`3.0`); int op float → float (the only implicit conversion) |
| `bool` | `true`, `false` | no truthiness — conditions must be bool |
| `string` | `"hiss\n"` | `+` joins two strings; escapes `\n \t \" \\` |
| `none` | `none` | "no value": can be stored, passed, compared, printed — not computed with |
| `coil<T>` | `[1, 2, 3]` | list |
| `scale<…>` | `@(3, "kaa")` | immutable tuple |
| `den<K, V>` | `@{ "rex": 3 }` | map |
| `clutch<T>` | `@[1, 2]` | set |
| class types | `new Snake("kaa")` | objects of user classes |
| `unknown` | function parameters | not known until run time — the VM checks it |

### 1.2 Operators

| Kind | Operators |
|---|---|
| Arithmetic | `+ - * / %`, unary `-` |
| Comparison | `< > <= >= == !=` (ints and floats compare with each other) |
| Logic | `&& \|\| !` (short-circuit) |
| Equality | scalars by value, scales by value, coils/dens/clutches/objects by identity |

Precedence from loosest to tightest: `||`, `&&`, `== !=`, `< > <= >=`,
`+ -`, `* / %`, unary. All binary operators are left-associative.

### 1.3 Statements

```
let x = 10;                 # declare (twice in one scope = error)
x = x + 5;                  # reassign
{ let x = 1; }              # shadow in an inner block
print x;
if (x > 3) { … } else { … }
while (x > 0) { x = x - 1; }
for (let i = 0; i < 3; i = i + 1) { … }
for item in xs { … }        # coil, scale, clutch, den (keys), string (chars)
fn f(a, b) { return a + b; }
# line comment      /* block comment */
```

Functions are hoisted (callable before their declaration). Function bodies
cannot see top-level `let`s — pass values in as parameters.

### 1.4 Built-in functions

| Call | Result |
|---|---|
| `len(x)` | length of a string or any collection |
| `str(x)` | the text `print x` would show |
| `int(x)` | from int / float (truncates) / bool / numeric string |
| `float(x)` | from int / float / numeric string |

A user function with the same name shadows the built-in.

### 1.5 Collections

| Collection | Methods | Indexing |
|---|---|---|
| coil `[…]` | `push(x)` `pop()` `has(x)` `len()` | `xs[i]`, `xs[i] = v` |
| scale `@(…)` | `len()` | `s[i]` (read only) |
| den `@{k: v}` | `has(k)` `remove(k)` `keys()` `values()` `len()` | `d[k]`, `d[k] = v` |
| clutch `@[…]` | `add(x)` `has(x)` `remove(x)` `len()` | — |

- Den keys and clutch items must be hashable: scalars or scales of them.
- `1` and `1.0` are the same key.
- Collections live on the heap: `let ys = xs;` makes two names for **one**
  coil.

### 1.6 Classes and object-oriented programming

```
abstract class Shape {
  abstract fn area();                        # abstraction
  fn describe() { return "area " + str(self.area()); }
}
class Circle : Shape {                       # inheritance
  priv let r;                                # encapsulation
  fn init(r) { self.r = r; }                 # constructor
  fn init() { self.r = 1; }                  # overloading by arity
  fn area() { return 3.14 * self.r * self.r; }   # overriding
}
let shapes = [new Circle(2), new Circle()];
for s in shapes { print s.describe(); }      # polymorphism
```

| Feature | How |
|---|---|
| Classes and objects | `class C { let f = …; fn m() { … } }`, `new C(…)` |
| Fields | `let f;` (starts as `none`) or `let f = expr;` (runs for every new object) |
| Methods, `self` | `self` is the object the method runs on |
| Constructor | `fn init(…)` — the nearest `init` up the chain with the right argument count |
| Inheritance | `class B : A` — fields and methods are inherited; the class graph must have no cycles |
| Overriding | same name **and** same number of parameters in a subclass |
| `super` | `super.m(…)` calls the parent's `m`, fixed at compile time |
| Polymorphism | `obj.m()` picks the override from the object's run-time class (dynamic dispatch) |
| Encapsulation | `priv` fields/methods — usable only by the declaring class's own methods |
| Abstraction | `abstract class`, `abstract fn m();` — no `new`; concrete subclasses must implement every abstract method |
| Overloading | same name, different parameter counts — for functions, methods and `init` |
| Subtyping | a `Snake` value fits where an `Animal` is expected; `[new Circle(), new Square()]` is a `coil<Shape>` |

### 1.7 Errors the language reports

| Phase | Examples |
|---|---|
| 1 Lexing | `123abc`, `1.2.3`, unterminated string or comment, stray `$` |
| 2 Parsing | `let = 5;` — anything the LL(1) table has no entry for |
| 3 Semantic | undeclared name, `let` twice in one scope, type mismatch, non-bool condition, wrong argument count, unhashable key, writing into a scale, unknown field or method, `self`/`super` outside a class, inheritance cycle, `new` on an abstract class, missing override, private access, duplicate overload |
| 7 Run time | division by zero, index out of range, missing den key, computing with `none`, bad `int("abc")`, type errors on `unknown` values, private access through an unknown value, 256-frame cap (runaway recursion), 10 000-step cap (the halting problem) |

---

## 2. The compiler (7 phases)

Every phase records every step it takes. Each step comes with a
What / Why / Formal / Next explanation and highlights the source span.

| # | Phase | What it does | Theory shown |
|---|---|---|---|
| 1 | Lexing | DFA with a total δ (DEAD trap state), longest match, keyword table | regular languages, DFA 5-tuple |
| 2 | Parsing | pure-BNF grammar → FIRST/FOLLOW → LL(1) table → table-driven PDA → parse tree → AST | context-free grammars, PDA, left-factoring |
| 3 | Semantic | hoisting (functions, classes), scope-stack symbol table, types, slots, class-graph checks | context-sensitive checks, `{wcw}`, Rice's theorem |
| 4 | IR | post-order syntax-directed translation to stack code, backpatching, `for` desugaring | syntax-directed translation |
| 5 | CFG + optimize | leaders, basic blocks, edges; constant folding and propagation, branch folding, dead-code removal, peephole — repeated until nothing changes; never folds `1/0` | fixpoints, Rice's theorem |
| 6 | Bytecode | 2-byte wordcode, relative jumps, `EXTENDED_ARG` sizing fixpoint, constant/name/variable tables, line table | assembly |
| 7 | VM | fetch–decode–execute over raw bytes; operand stack, frame stack, heap; dynamic dispatch; step cap and frame cap | universal machine, Turing-completeness, halting problem |

Compilation stops at the first failing phase. Later phases show as blocked.

---

## 3. The app

### 3.1 Screens
- **Flowchart** of the 7 phases. Each box shows done / active / error /
  blocked. Click a phase to zoom into it.
- **Phase views:**
  - DFA graph and δ table, input tape, token list, 5-tuple
  - parse tree / AST, LL(1) table, call graph, grammar, PDA stack and input
  - typed AST, scope stack (plus the class table)
  - IR generation walk
  - CFG with coloured edges (true/false, next/done, back-edges) and rewrite diffs
  - bytecode tables and encoding
  - VM: operand stack, call frames, locals, **heap panel** (touched objects
    outlined) and console
- **Right panel:**
  - phases 1–3: the editable source (Save or Ctrl+Enter recompiles)
  - phase 4: source + growing IR
  - phase 5: IR diff
  - phases 6–7: `dis`-style listing with bytes, and the program counter in phase 7
- **Intro card** (`?`) per phase: its theory, and why the previous machine
  wasn't enough.

### 3.2 Playback
- Scrubber with play/pause, step back/forward, speed dial, and chapter ticks
  per source line.
- A 2×2 explanation grid for every step. Theory terms are underlined, with
  glossary definitions on hover.
- Autoplay zooms back out to the flowchart when a phase finishes.

### 3.3 Programs
- 32 bundled samples in the "Load sample…" dropdown (list in the README).
- Upload any `.orbs` file.

### 3.4 Responsive layout
- **Desktop:** phase view on the left, side panel on the right.
- **Tablet in portrait, and phones:** the side panel docks under the view
  and can collapse.
- **Phones (≤ 640 px):**
  - one-column flowchart scaled to fit
  - What/Why/Formal/Next as tabs
  - bigger touch buttons and a compact navbar
  - stacked side columns
- **Graphs:** drag to pan, wheel or pinch to zoom, double-click to reset.

---

## 4. Tooling

| Command | What |
|---|---|
| `node scripts/run.ts file.orbs` / `-e 'code'` | run a program, print its output or its first error |
| `node scripts/check-{lex,parse,semantic,ir,opt,bytecode,vm}.ts` | one assert-based self-check per phase; `check-vm` runs every sample and checks where each `err-*` stops |
| `node node_modules/typescript/bin/tsc -b --force` | typecheck |
| `node node_modules/vite/bin/vite.js` / `… build` | dev server / production build |

---

## 5. Not supported (yet)

- first-class functions and closures (functions can't be stored in variables)
- interfaces
- overloading by argument type (only by count — types are often unknown until run time)
- string indexing (use `for ch in s`)
- fields added to an object after creation
- imports / multiple files
