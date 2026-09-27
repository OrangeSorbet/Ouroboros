// Snek's context-free grammar as data — the single source of truth for the
// syntax phase. ll1.ts computes FIRST/FOLLOW/M from it, parser.ts (the PDA)
// is driven by M, callGraph.ts derives the call graph from it, and the UI
// prints both notations from here, so the grammar can never drift between
// the parser and what the screen claims (docs/phase34plan.md §9.1).
import { TokenKind } from "./tokens.ts";

// Pure BNF (plan §7.4): only `A -> symbols | symbols`, with ε for the empty
// right-hand side. EBNF's `*` / `?` were converted mechanically into helper
// non-terminals (…List, …Opt, …Tail, and the operator groups …Op) because the
// textbook PDA expands exactly one production at a time. Terminals are
// written as they appear in source (`let`, `=`, `(`) or as token-class names
// (IDENT, NUMBER, STRING, EOF), and are mapped to TokenKind below.
const BNF_TEXT = `
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
`;

// How each terminal is written in the grammar text / on screen.
export const TERMINAL_TEXT: Record<TokenKind, string> = {
  IDENT: "IDENT", NUMBER: "NUMBER", STRING: "STRING",
  LET: "let", PRINT: "print", IF: "if", ELSE: "else", WHILE: "while", FOR: "for",
  FN: "fn", RETURN: "return", TRUE: "true", FALSE: "false",
  PLUS: "+", MINUS: "-", STAR: "*", SLASH: "/", ASSIGN: "=", EQ: "==", NEQ: "!=",
  LT: "<", GT: ">", LTE: "<=", GTE: ">=", AND: "&&", OR: "||", NOT: "!",
  LPAREN: "(", RPAREN: ")", LBRACE: "{", RBRACE: "}", LBRACKET: "[", RBRACKET: "]",
  COMMA: ",", SEMI: ";",
  EOF: "EOF",
};

export interface Production {
  id: number;
  lhs: string;
  rhs: string[]; // terminals are TokenKind names; [] is ε
  helper: boolean; // lhs was introduced by the EBNF → BNF conversion
}

export const START_SYMBOL = "Program";

const TEXT_TO_KIND = new Map<string, TokenKind>(
  (Object.entries(TERMINAL_TEXT) as [TokenKind, string][]).map(([k, t]) => [t, k]),
);

export const isHelper = (nt: string) => /(List|Opt|Tail)$/.test(nt) || /^(Eq|Comp|Add|Mul)Op$/.test(nt);

function parseBnf(text: string): Production[] {
  const rows = text.trim().split("\n").map((l) => l.split("->").map((s) => s.trim()));
  const lhsSet = new Set(rows.map(([lhs]) => lhs));
  const out: Production[] = [];
  for (const [lhs, body] of rows) {
    for (const alt of body.split(/\s\|\s/)) {
      const rhs = alt.trim() === "ε" ? [] : alt.trim().split(/\s+/).map((w) => {
        if (lhsSet.has(w)) return w;
        const kind = TEXT_TO_KIND.get(w);
        // A typo in BNF_TEXT is a programming error — fail loudly at load.
        if (!kind) throw new Error(`grammar.ts: unknown symbol '${w}' in ${lhs}`);
        return kind;
      });
      out.push({ id: out.length, lhs, rhs, helper: isHelper(lhs) });
    }
  }
  return out;
}

export const PRODUCTIONS: Production[] = parseBnf(BNF_TEXT);
export const NON_TERMINALS: string[] = [...new Set(PRODUCTIONS.map((p) => p.lhs))];
export const TERMINALS: TokenKind[] = Object.keys(TERMINAL_TEXT) as TokenKind[];

const NT_SET = new Set(NON_TERMINALS);
export const isNonTerminal = (s: string) => NT_SET.has(s);

// Display form of one grammar symbol (`LET` → `let`, `Expr` → `Expr`).
export const symText = (s: string) => (TERMINAL_TEXT as Record<string, string>)[s] ?? s;

export const rhsText = (p: Production) => (p.rhs.length ? p.rhs.map(symText).join(" ") : "ε");
export const productionText = (p: Production) => `${p.lhs} → ${rhsText(p)}`;

// EBNF shorthand (plan §7.3), one entry per original (non-helper)
// non-terminal. Display only: the PDA never sees it, since `*` and `?` are
// not CFG notation.
export const GRAMMAR_EBNF: Record<string, string> = {
  Program: `Program -> Decl* EOF`,
  Decl: `Decl -> FuncDecl | Statement`,
  FuncDecl: `FuncDecl -> "fn" IDENT "(" Params? ")" Block`,
  Params: `Params -> IDENT ( "," IDENT )*`,
  Statement: `Statement -> LetStmt | PrintStmt | IfStmt | WhileStmt | ForStmt | ReturnStmt | Block | ExprStmt`,
  LetStmt: `LetStmt -> "let" IDENT "=" Expr ";"`,
  PrintStmt: `PrintStmt -> "print" Expr ";"`,
  IfStmt: `IfStmt -> "if" "(" Expr ")" Block ( "else" Block )?`,
  WhileStmt: `WhileStmt -> "while" "(" Expr ")" Block`,
  ForStmt: `ForStmt -> "for" "(" ForInit Expr? ";" SimpleStmt? ")" Block`,
  ForInit: `ForInit -> LetStmt | ExprStmt | ";"`,
  ReturnStmt: `ReturnStmt -> "return" Expr? ";"`,
  Block: `Block -> "{" Statement* "}"`,
  ExprStmt: `ExprStmt -> SimpleStmt ";"`,
  SimpleStmt: `SimpleStmt -> Expr ( "=" Expr )?`,
  Expr: `Expr -> LogicOr`,
  LogicOr: `LogicOr -> LogicAnd ( "||" LogicAnd )*`,
  LogicAnd: `LogicAnd -> Equality ( "&&" Equality )*`,
  Equality: `Equality -> Comparison ( ("==" | "!=") Comparison )*`,
  Comparison: `Comparison -> Additive ( ("<" | ">" | "<=" | ">=") Additive )*`,
  Additive: `Additive -> Multiplicative ( ("+" | "-") Multiplicative )*`,
  Multiplicative: `Multiplicative -> Unary ( ("*" | "/") Unary )*`,
  Unary: `Unary -> "-" Unary | "!" Unary | Postfix`,
  Postfix: `Postfix -> Primary ( "(" Args? ")" | "[" Expr "]" )*`,
  Args: `Args -> Expr ( "," Expr )*`,
  Primary: `Primary -> NUMBER | STRING | IDENT | "true" | "false" | "(" Expr ")" | "[" Args? "]"`,
};
