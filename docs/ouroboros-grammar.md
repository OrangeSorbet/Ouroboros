# Ouroboros Language Grammar

Source of truth: `src/compiler/grammar.ts` (the pure BNF below is parsed from
it at load time, and the parser, LL(1) table, call graph and grammar tab are
all derived from it). This file is kept in sync by hand.

## 1. Alphabet & Token Types

| Category | Tokens |
|---|---|
| Keywords | `let` `print` `if` `else` `while` `for` `in` `fn` `return` `true` `false` `none` `class` `new` `self` `super` `abstract` `priv` |
| Identifier | `IDENT` — `[a-zA-Z_][a-zA-Z0-9_]*` (not a keyword) |
| Number | `NUMBER` — `[0-9]+` (unbounded integers; `123abc` is a lexical error) |
| Float | `FLOAT` — `[0-9]+\.[0-9]+` (`3.` alone lexes as `NUMBER 3` then `.`; `1.2.3` is a lexical error) |
| String | `STRING` — `"…"` on one line, escapes `\n` `\t` `\"` `\` |
| Operators | `+` `-` `*` `/` `%` `=` `==` `!=` `<` `>` `<=` `>=` `&&` `\|\|` `!` |
| Punctuation | `(` `)` `{` `}` `[` `]` `,` `;` `.` `:` `@` |
| Comments | `#` to end of line, `/* … */` (skipped, not tokens) |
| Whitespace | space, tab, `\r`, newline (skipped) |
| End | `EOF` (the textbook `$` end-marker) |

Keywords are recognised by longest match: the DFA accepts the whole
identifier-shaped lexeme, then a keyword check decides between `IDENT` and
the keyword's own token.

## 2. Grammar — EBNF shorthand

`*` = zero or more, `?` = optional. Readable, but not CFG notation.

```
Program        -> Decl* EOF
Decl           -> FuncDecl | ClassDecl | Statement
ClassDecl      -> "abstract"? "class" IDENT ( ":" IDENT )? "{" Member* "}"
Member         -> "priv"? ( "let" IDENT ( "=" Expr )? ";" | FuncDecl
                          | "abstract" "fn" IDENT "(" Params? ")" ";" )
FuncDecl       -> "fn" IDENT "(" Params? ")" Block
Params         -> IDENT ( "," IDENT )*

Statement      -> LetStmt | PrintStmt | IfStmt | WhileStmt | ForStmt
                | ReturnStmt | Block | ExprStmt
LetStmt        -> "let" IDENT "=" Expr ";"
PrintStmt      -> "print" Expr ";"
IfStmt         -> "if" "(" Expr ")" Block ( "else" Block )?
WhileStmt      -> "while" "(" Expr ")" Block
ForStmt        -> "for" "(" ForInit Expr? ";" SimpleStmt? ")" Block
                | "for" IDENT "in" Expr Block
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
Multiplicative -> Unary ( ("*" | "/" | "%") Unary )*
Unary          -> "-" Unary | "!" Unary | Postfix
Postfix        -> Primary ( "(" Args? ")" | "[" Expr "]" | "." IDENT )*
Args           -> Expr ( "," Expr )*
Primary        -> NUMBER | FLOAT | STRING | IDENT | "true" | "false" | "none"
                | "(" Expr ")" | "[" Args? "]"
                | "@" "(" Args? ")" | "@" "[" Args? "]" | "@" "{" Pairs? "}"
                | "self" | "super" "." IDENT | "new" IDENT "(" Args? ")"
Pairs          -> Expr ":" Expr ( "," Expr ":" Expr )*
```

## 3. Grammar — pure BNF (official; what the parser runs on)

Mechanical conversion from EBNF: `X*` → `XList → X XList | ε`; `X?` →
`XOpt → X | ε`; `A ( op B )*` → `A ATail`, `ATail → op B ATail | ε`.
The `…List` / `…Opt` / `…Tail` / `…Op` non-terminals are **helpers** — the
UI dims them and the call graph folds them into their parent rule.

```
Program        -> DeclList EOF
DeclList       -> Decl DeclList | ε
Decl           -> FuncDecl | ClassDecl | Statement
FuncDecl       -> fn IDENT ( ParamsOpt ) Block
ParamsOpt      -> Params | ε
Params         -> IDENT ParamsTail
ParamsTail     -> , IDENT ParamsTail | ε
ClassDecl      -> AbstractOpt class IDENT ParentOpt { MemberList }
AbstractOpt    -> abstract | ε
ParentOpt      -> : IDENT | ε
MemberList     -> Member MemberList | ε
Member         -> VisOpt MemberBody
VisOpt         -> priv | ε
MemberBody     -> FieldDecl | FuncDecl | AbstractFn
AbstractFn     -> abstract fn IDENT ( ParamsOpt ) ;
FieldDecl      -> let IDENT FieldInit ;
FieldInit      -> = Expr | ε
Statement      -> LetStmt | PrintStmt | IfStmt | WhileStmt | ForStmt | ReturnStmt | Block | ExprStmt
LetStmt        -> let IDENT = Expr ;
PrintStmt      -> print Expr ;
IfStmt         -> if ( Expr ) Block ElseOpt
ElseOpt        -> else Block | ε
WhileStmt      -> while ( Expr ) Block
ForStmt        -> for ForRest
ForRest        -> ( ForInit ExprOpt ; SimpleOpt ) Block | IDENT in Expr Block
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
MulOp          -> * | / | %
Unary          -> - Unary | ! Unary | Postfix
Postfix        -> Primary PostfixTail
PostfixTail    -> ( ArgsOpt ) PostfixTail | [ Expr ] PostfixTail | . IDENT PostfixTail | ε
ArgsOpt        -> Args | ε
Args           -> Expr ArgsTail
ArgsTail       -> , Expr ArgsTail | ε
Primary        -> NUMBER | FLOAT | STRING | IDENT | true | false | none | ( Expr ) | [ ArgsOpt ] | @ AtLit | self | super . IDENT | new IDENT ( ArgsOpt )
AtLit          -> ( ArgsOpt ) | [ ArgsOpt ] | { PairsOpt }
PairsOpt       -> Pairs | ε
Pairs          -> Expr : Expr PairsTail
PairsTail      -> , Expr : Expr PairsTail | ε
```

## 3a. Types and built-ins (M1)

| Type | Values | Notes |
|---|---|---|
| `int` | unbounded integers | `/` and `%` truncate toward zero; `%` takes the dividend's sign |
| `float` | IEEE doubles, printed with a dot (`3.0`) | `int ⊕ float → float` is the **only** implicit conversion |
| `bool` | `true` `false` | no truthiness: conditions must be bool |
| `string` | `"…"` | `+` concatenates two strings; `str + int` is an error — use `str(x)` |
| `array<T>` | `[a, b]` | one element type |
| `none` | `none` | "no value": may be stored, passed, compared (`==` `!=`) and printed, not computed with. `let x = none;` gives `x` type `unknown` |

Built-ins (arity 1, resolved only when no user declaration of the name is in
scope, so `fn len(x)` shadows them): `len(string | array) → int`,
`str(any) → string`, `int(int | float | bool | string) → int` (truncates;
bad text is a run-time error), `float(int | float | string) → float`.

## 3b. Collections (M2)

| Name | Literal | Type | Methods |
|---|---|---|---|
| coil (list) | `[1, 2]` | `coil<T>` | `push(x)` `pop()` `has(x)` `len()`; `c[i]`, `c[i] = v` |
| scale (tuple) | `@(1, "a")` | `scale<T1, …, Tn>` | `len()`; `s[i]` (literal index gives that position's type); **immutable** |
| den (map) | `@{ "k": 1 }` | `den<K, V>` | `has(k)` `remove(k)` `keys()` `values()` `len()`; `d[k]`, `d[k] = v` |
| clutch (set) | `@[1, 2]` | `clutch<T>` | `add(x)` `has(x)` `remove(x)` `len()` |

- Den keys and clutch items must be **hashable**: scalars, or scales of
  hashables. `1` and `1.0` are the same key; an equal key already present
  is kept.
- `==`: scalars by value, scales structurally, coil/den/clutch by identity.
- `for x in e { … }` walks a coil, scale, clutch, den (its keys) or string
  (its characters). The items are snapshotted when the loop starts.
- `x.m(…)` is a method call; `x.m` alone is an error (no first-class methods).
- `len(x)` works on every collection and on strings.
- Collections live on the VM heap; variables and the stack hold references
  (`coil #1`), so `let ys = xs;` aliases one coil.

`for` is left-factored (`ForStmt -> for ForRest`) so one token of lookahead
after `for` — `(` or `IDENT` — picks the C-style or the for-each form. The
literal openers are `@(` `@[` `@{` rather than a bare `{`, which would clash
with a block at the start of a statement.

## 3c. Classes (M3)

```
class Animal {
  let name;                 # field, starts as none
  let legs = 4;             # field with an initializer (runs per object)
  fn init(name) { self.name = name; }
  fn speak() { return "..."; }
}
class Snake : Animal {      # Snake inherits Animal's fields and methods
  let legs = 0;             # a subclass may change a field's default
  fn speak() { return "hiss"; }                      # override
  fn intro() { return "(slithers) " + super.speak(); }
}
let s = new Snake("kaa");   # runs Animal.<fields>, Snake.<fields>, then init
```

- Classes are hoisted like functions. The inheritance graph must be a tree:
  every parent exists and no chain loops (`class A : B {} class B : A {}` is
  a Phase 3 error).
- A method is a function with a hidden first parameter `self` (slot 0).
  `self` / `super` outside a method are errors.
- `obj.f` reads a field; `obj.m(…)` calls a method. Both are looked up the
  class chain, leaf first. Objects have exactly the fields their classes
  declare — assigning an undeclared field is an error.
- **Dynamic dispatch:** Phase 3 only proves that *some* `m` exists; the VM
  picks the override from the object's run-time class.
  **`super.m(…)` is static:** it is resolved at compile time to the
  parent chain's `m`.
- `new C(a…)` needs the arity of the nearest `init` up the chain (0 if none).
- Object types are compatible along the chain (a `Snake` value may be stored
  where an `Animal` is expected). `==` on objects is identity.

## 3d. Encapsulation, abstraction, overloading (M4)

```
abstract class Shape {
  abstract fn area();                      # no body: subclasses must supply it
  fn describe() { return "area " + str(self.area()); }
}
class Account {
  priv let balance = 0;                    # only Account's own methods see it
  fn deposit(n) { self.balance = self.balance + n; }
}
fn add(a, b) { return a + b; }             # add/2
fn add(a, b, c) { return a + b + c; }      # add/3 — overloaded by arity
```

- **`priv`** fields and methods are usable only inside the methods (and
  field initializers) of the class that declares them — not from
  subclasses, not from outside. Phase 3 checks it whenever the receiver's
  class is known; the VM re-checks it on `unknown` receivers so privacy
  cannot be bypassed.
- **`abstract class`** cannot be instantiated. `abstract fn m(…);` is only
  allowed in an abstract class, and every concrete subclass must implement
  each abstract method it inherits (same name and arity). `super.m()` on an
  abstract `m` is an error.
- **Overloading by arity:** functions and methods may share a name if their
  parameter counts differ. Members are keyed `name/arity`; code objects get
  the `/arity` suffix only when a name is actually overloaded (`add/2`,
  `Point.init/0`). A call picks the overload by its argument count;
  overriding means same name **and** arity. Overloading by argument *type*
  is not offered: many types are only known at run time (Rice).
- A collection of sibling objects widens to their nearest common ancestor
  (`[new Circle(1), new Square(2)]` is `coil<Shape>`).

## 4. Left-factoring (why there is no `AssignStmt` rule)

With arrays, `a[i] = 5;` and `a[i];` share an arbitrarily long prefix, so a
rule `AssignStmt -> IDENT "=" Expr ";"` next to `ExprStmt -> Expr ";"` would
make the grammar not LL(k) for any fixed k. Left-factoring pulls the common
prefix out: `SimpleStmt -> Expr AssignTail`, `AssignTail -> "=" Expr | ε`.
The grammar now over-approximates (`1 = 2;` parses); Semantic Analysis
rejects targets that aren't a name or `x[i]`. The AST still has an
`AssignStmt` node, built when `AssignTail` is non-empty. Likewise, whether a
name was declared before use is not context-free and is checked in Semantic
Analysis, not here.

## 5. LL(1)

`src/compiler/ll1.ts` computes FIRST, FOLLOW and the parse table
M[non-terminal, lookahead] → production; `scripts/check-parse.ts` asserts
there are **no conflicts**. So the parser is a **deterministic** PDA with one
token of lookahead: a stack of grammar symbols starting as `[Program]`;
*expand* (pop A, push the right-hand side of M[A, t] reversed) and *match*
(pop a terminal equal to the lookahead, advance). `Program -> DeclList EOF`
matches `EOF` explicitly, so it accepts by empty stack once the input is
fully read.

- **No dangling else:** `if` requires a `Block`, so an `else` always follows a
  `}` and belongs to that `if`.
- **Precedence** by layering: `LogicOr` above `LogicAnd` above … above
  `Unary`; a deeper rule binds tighter.
- **Associativity:** the `…Tail` form makes the parse tree right-leaning;
  the AST builder folds each tail left-to-right, so `1 - 2 - 3` is
  `(1 - 2) - 3`.
- `fn` is only derivable from `Decl`, which only `Program` reaches, so
  functions can only be declared at top level.

## 6. Sample Ouroboros Program (`src/samples/demo.orbs`)

```
# demo.orbs
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
