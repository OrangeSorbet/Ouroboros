# Snek Language Grammar

Source of truth: `src/compiler/grammar.ts` (the pure BNF below is parsed from
it at load time, and the parser, LL(1) table, call graph and grammar tab are
all derived from it). This file is kept in sync by hand.

## 1. Alphabet & Token Types

| Category | Tokens |
|---|---|
| Keywords | `let` `print` `if` `else` `while` `for` `fn` `return` `true` `false` |
| Identifier | `IDENT` — `[a-zA-Z_][a-zA-Z0-9_]*` (not a keyword) |
| Number | `NUMBER` — `[0-9]+` (unbounded integers; `123abc` is a lexical error) |
| String | `STRING` — `"…"` on one line, escapes `\n` `\t` `\"` `\` |
| Operators | `+` `-` `*` `/` `=` `==` `!=` `<` `>` `<=` `>=` `&&` `\|\|` `!` |
| Punctuation | `(` `)` `{` `}` `[` `]` `,` `;` |
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

## 3. Grammar — pure BNF (official; what the parser runs on)

Mechanical conversion from EBNF: `X*` → `XList → X XList | ε`; `X?` →
`XOpt → X | ε`; `A ( op B )*` → `A ATail`, `ATail → op B ATail | ε`.
The `…List` / `…Opt` / `…Tail` / `…Op` non-terminals are **helpers** — the
UI dims them and the call graph folds them into their parent rule.

```
Program        -> DeclList EOF
DeclList       -> Decl DeclList | ε
Decl           -> FuncDecl | Statement
FuncDecl       -> fn IDENT ( ParamsOpt ) Block
ParamsOpt      -> Params | ε
Params         -> IDENT ParamsTail
ParamsTail     -> , IDENT ParamsTail | ε
Statement      -> LetStmt | PrintStmt | IfStmt | WhileStmt | ForStmt | ReturnStmt | Block | ExprStmt
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

## 6. Sample Snek Program (`src/samples/demo.snek`)

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
