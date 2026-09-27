# Snek Language Grammar

## 1. Alphabet & Token Types

| Category | Tokens |
|---|---|
| Keywords | `let` `print` `if` `else` `while` `true` `false` |
| Identifier | `IDENT` — `[a-zA-Z_][a-zA-Z0-9_]*` |
| Number | `NUMBER` — `[0-9]+` (integers only, for now) |
| Operators | `+` `-` `*` `/` `=` `==` `!=` `<` `>` `<=` `>=` |
| Punctuation | `(` `)` `{` `}` `;` |
| Comment | `#` to end of line (skipped, not a token) |
| Whitespace | space, tab, newline (skipped) |
| End | `EOF` |

Keywords are matched first — if an identifier's lexeme equals a keyword string, it's emitted as that keyword's token, not `IDENT`. This is a standard **maximal-munch + keyword lookup** rule, handled naturally by ending in an `IDENT`-accepting DFA state and checking the lexeme against the keyword table before emitting.

## 2. Context-Free Grammar (BNF)

```
Program     -> Statement* EOF

Statement   -> LetStmt
             | AssignStmt
             | PrintStmt
             | IfStmt
             | WhileStmt
             | ExprStmt

LetStmt     -> "let" IDENT "=" Expr ";"
AssignStmt  -> IDENT "=" Expr ";"
PrintStmt   -> "print" Expr ";"
IfStmt      -> "if" "(" Expr ")" Block ( "else" Block )?
WhileStmt   -> "while" "(" Expr ")" Block
Block       -> "{" Statement* "}"
ExprStmt    -> Expr ";"

Expr        -> Equality
Equality    -> Comparison ( ("==" | "!=") Comparison )*
Comparison  -> Additive  ( ("<" | ">" | "<=" | ">=") Additive )*
Additive    -> Multiplicative ( ("+" | "-") Multiplicative )*
Multiplicative -> Unary ( ("*" | "/") Unary )*
Unary       -> "-" Unary | Primary
Primary     -> NUMBER | IDENT | "true" | "false" | "(" Expr ")"
```

This grammar is unambiguous and encodes standard arithmetic/comparison precedence via the rule hierarchy (`Equality` → `Comparison` → `Additive` → `Multiplicative` → `Unary` → `Primary`), which is exactly why a recursive-descent parser (our PDA) can be written directly from it — one function per non-terminal.

## 3. Sample Snek Program

```
let x = 5;
let y = x + 3;
if (y > 5) {
  print y;
} else {
  print 0;
}
```

## 4. Notes for the PDA/Parser

Each non-terminal above becomes one parser function. The **explicit stack** we expose for visualization tracks which non-terminal (rule) is currently being expanded — e.g. entering `IfStmt` pushes `IfStmt`, entering the nested `Expr` pushes `Expr` on top, popping back out as each rule completes. That stack trace is what Phase 2's "Expose parser stack trace for visualization" task will animate.