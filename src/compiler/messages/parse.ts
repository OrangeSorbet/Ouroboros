// Human-readable text for the syntax phase — kept separate from
// grammar.ts/ll1.ts/parser.ts so the automaton logic never carries prose,
// and the wording can be tuned without touching parsing code.
import type { Token } from "../tokens.ts";
import type { Explanation } from "../trace.ts";
import {
  PRODUCTIONS, TERMINAL_TEXT, isNonTerminal, productionText, rhsText, symText, type Production,
} from "../grammar.ts";
import { FIRST, NULLABLE } from "../ll1.ts";

// Lexemes can be long (strings); keep every cell within its ~160-char budget.
const lx = (t: Token) => {
  if (t.kind === "EOF") return "EOF";
  return t.lexeme.length > 14 ? `${t.lexeme.slice(0, 13)}…` : t.lexeme;
};
const termText = (kind: string) => (TERMINAL_TEXT as Record<string, string>)[kind] ?? kind;
const setText = (kinds: string[], max = 8) =>
  `{${kinds.slice(0, max).map(termText).join(", ")}${kinds.length > max ? ", …" : ""}}`;

// Plain-English narration for expanding the rules a reader recognises as
// statements — told as a running story, while the formal cell carries the
// exact table entry.
const EXPAND_PLAIN: Record<string, (tok: string) => string> = {
  Program: () => "Parsing begins for the whole program.",
  Statement: (tok) => `'${tok}' seen — this starts a new statement.`,
  FuncDecl: () => "'fn' seen — a function declaration begins.",
  LetStmt: () => "Starts with 'let' — this is a variable declaration.",
  PrintStmt: () => "'print' seen — this statement outputs a value.",
  IfStmt: () => "'if' seen — a conditional branch begins.",
  WhileStmt: () => "'while' seen — a loop begins.",
  ForStmt: () => "'for' seen — a counted loop begins.",
  ReturnStmt: () => "'return' seen — the function hands back a value.",
  Block: () => "'{' seen — entering a block of statements.",
};

// Which operators each …Tail loops over — used when it derives ε.
const TAIL_OPS: Record<string, string> = {
  LogicOrTail: "||",
  LogicAndTail: "&&",
  EqualityTail: "== or !=",
  ComparisonTail: "<, >, <=, or >=",
  AdditiveTail: "+ or -",
  MultiplicativeTail: "* or /",
  PostfixTail: "call '(' or index '['",
  ParamsTail: "',' parameter",
  ArgsTail: "',' argument",
};

const LAYER_BELOW: Record<string, string> = {
  LogicOr: "LogicAnd",
  LogicAnd: "Equality",
  Equality: "Comparison",
  Comparison: "Additive",
  Additive: "Multiplicative",
  Multiplicative: "Unary",
};

const BINARY_TAILS = new Set(["LogicOrTail", "LogicAndTail", "EqualityTail", "ComparisonTail", "AdditiveTail", "MultiplicativeTail"]);

// Grammar-grounded reason an expand happened, where one rule has something
// specific to teach (determinism, precedence, left-factoring, dangling else).
function specialWhy(p: Production, t: Token): string | undefined {
  const first = p.rhs[0];
  if (p.lhs === "Program") {
    return "Same as recursive descent: each expand is a function call for that rule; it returns once all of its right-hand side has been matched.";
  }
  if (p.lhs === "Decl" && first === "FuncDecl") {
    return "'fn' ∈ FIRST(FuncDecl). Decl is only derivable from Program's DeclList, so functions can only be declared at top level.";
  }
  if (p.lhs === "IfStmt") {
    return "No dangling else: 'if' requires a Block, so an 'else' can only follow a '}' and belongs to that if — exactly one parse tree.";
  }
  if ((p.lhs === "Statement" || p.lhs === "ForInit") && first === "ExprStmt") {
    return "Left-factored: an assignment and a bare expression both start with an Expr, so parse the Expr first and decide on '=' afterwards — LL(1).";
  }
  if (p.lhs === "AssignTail" && p.rhs.length) {
    return "Only now does '=' reveal an assignment (left-factoring). Any Expr is accepted as target; Semantic Analysis rejects non-lvalues.";
  }
  if (p.lhs === "Expr") {
    return "A chain rule: it adds no structure, but the PDA still expands it so no grammar symbol is skipped. The AST collapses such chains.";
  }
  if (LAYER_BELOW[p.lhs]) {
    return `Precedence by layering: ${LAYER_BELOW[p.lhs]} is expanded deeper, so its operators bind tighter than ${p.lhs}'s.`;
  }
  if (BINARY_TAILS.has(p.lhs) && p.rhs.length) {
    return `'${termText(t.kind)}' starts another operand. Tail recursion replaces EBNF's ( op X )*; the tree leans right, the AST folds it left: (a op b) op c.`;
  }
  if (p.lhs === "PostfixTail" && p.rhs.length) {
    return "Postfix operators repeat via PostfixTail, so f(x)[0] chains left to right: call first, then index.";
  }
  if (p.lhs === "Primary" && first === "LPAREN") {
    return "Parentheses restart at Expr, the lowest-precedence layer — this recursion is how brackets override precedence.";
  }
  if (p.lhs === "Unary" && p.rhs.length === 2) {
    return "Unary is right-recursive, so prefix operators nest (- - x) and bind tighter than any binary operator.";
  }
  return undefined;
}

function expandWhy(p: Production, t: Token): string {
  const special = specialWhy(p, t);
  if (special) return special;
  const alts = PRODUCTIONS.filter((q) => q.lhs === p.lhs);
  if (alts.length === 1) {
    return `${p.lhs} has a single production, so there is nothing to choose — the PDA must replace it by its right-hand side.`;
  }
  const tt = termText(t.kind);
  if (!p.rhs.length) {
    const ops = TAIL_OPS[p.lhs];
    const head = ops ? `No (more) ${ops} here: ` : "";
    return `${head}'${tt}' ∈ FOLLOW(${p.lhs}) and starts no other alternative, so ${p.lhs} ⇒ ε, leaving '${tt}' for later.`;
  }
  return `'${tt}' ∈ FIRST(${rhsText(p)}) and no other ${p.lhs} alternative can start with it — LL(1): one lookahead decides, no guessing.`;
}

// Why a terminal is required exactly here, keyed by the rule whose
// production contains it — the same token kind means different things in
// different rules (an IDENT in LetStmt is the name being *declared*; in
// Primary it's a name being *read*).
const opFound = (what: string, tail: string, ops: string) =>
  `Found — ${what}; the AST combines both sides into one BinaryExpr, and ${tail} recurses to check for another ${ops}.`;

const CONSUME_REASONS: Record<string, Partial<Record<string, string>>> = {
  FuncDecl: {
    FN: "The keyword that made Decl choose FuncDecl.",
    IDENT: "Right after 'fn', the grammar requires a name — this is the function being declared.",
    LPAREN: "Opens the parameter list (ParamsOpt may derive ε: zero parameters).",
    RPAREN: "Closes the parameter list — what follows must be the body Block.",
  },
  Params: { IDENT: "The first parameter name." },
  ParamsTail: {
    COMMA: "Separates parameters; ParamsTail recurses once per extra name — BNF's stand-in for ( \",\" IDENT )*.",
    IDENT: "Another parameter name.",
  },
  LetStmt: {
    LET: "The keyword that made Statement choose LetStmt over every other alternative.",
    IDENT: "Right after 'let', the grammar requires a name — this is the variable being declared.",
    ASSIGN: "Separates the declared name from its initial-value expression.",
    SEMI: "Closes the declaration.",
  },
  PrintStmt: {
    PRINT: "The keyword that made Statement choose PrintStmt.",
    SEMI: "Closes the print statement, after its expression.",
  },
  IfStmt: {
    IF: "The keyword that made Statement choose IfStmt.",
    LPAREN: "The grammar wraps the condition in parentheses, so it can't be confused with what follows.",
    RPAREN: "Closes the condition — everything after this is the body, not part of the condition.",
  },
  ElseOpt: {
    ELSE: "An 'else' immediately after the then-branch's '}' means this if has an alternate branch.",
  },
  WhileStmt: {
    WHILE: "The keyword that made Statement choose WhileStmt.",
    LPAREN: "The grammar wraps the loop condition in parentheses.",
    RPAREN: "Closes the condition — everything after this is the loop body.",
  },
  ForStmt: {
    FOR: "The keyword that made Statement choose ForStmt.",
    LPAREN: "Opens the loop header: initializer, condition, update.",
    SEMI: "Separates the (optional) condition from the (optional) update; the initializer brought its own ';'.",
    RPAREN: "Closes the header — everything after this is the loop body.",
  },
  ForInit: { SEMI: "An empty initializer: ForInit's third alternative is a lone ';'." },
  ReturnStmt: {
    RETURN: "The keyword that made Statement choose ReturnStmt.",
    SEMI: "Closes the return; its value is optional (ExprOpt may derive ε).",
  },
  Block: {
    LBRACE: "Marks where this block's statements begin.",
    RBRACE: "Marks where this block ends — StmtList already derived ε on seeing it; now it is matched.",
  },
  ExprStmt: {
    SEMI: "Closes a statement that's just an expression or an assignment (no keyword started it).",
  },
  AssignTail: {
    ASSIGN: "Confirms this is a reassignment, not just a bare expression statement.",
  },
  LogicOrTail: { OR: "Found '||' — the AST joins both sides into one short-circuit LogicalExpr; LogicOrTail recurses for another ||." },
  LogicAndTail: { AND: "Found '&&' — the AST joins both sides into one short-circuit LogicalExpr; LogicAndTail recurses for another &&." },
  EqOp: {
    EQ: opFound("this becomes an equality comparison", "EqualityTail", "== or !="),
    NEQ: opFound("this becomes an inequality comparison", "EqualityTail", "== or !="),
  },
  CompOp: Object.fromEntries(["LT", "GT", "LTE", "GTE"].map((k) => [k, opFound("an ordering comparison", "ComparisonTail", "comparison operator")])),
  AddOp: Object.fromEntries(["PLUS", "MINUS"].map((k) => [k, opFound("an additive operator", "AdditiveTail", "+ or -")])),
  MulOp: Object.fromEntries(["STAR", "SLASH"].map((k) => [k, opFound("a multiplicative operator", "MultiplicativeTail", "* or /")])),
  Unary: {
    MINUS: "A leading '-' — the operand is negated once Unary recurses into itself for whatever follows.",
    NOT: "A leading '!' — the operand is negated (logically) once Unary recurses into itself for whatever follows.",
  },
  PostfixTail: {
    LPAREN: "Opens a call's argument list — the value to its left is the function being called.",
    RPAREN: "Closes the argument list; PostfixTail may continue with another call or index.",
    LBRACKET: "Opens an index — the value to its left is the array being indexed.",
    RBRACKET: "Closes the index; PostfixTail may continue with another call or index.",
  },
  ArgsTail: { COMMA: "Separates arguments; ArgsTail recurses once per extra argument." },
  Primary: {
    NUMBER: "A number literal — this alone is a complete Primary, nothing more to consume.",
    STRING: "A string literal — this alone is a complete Primary.",
    IDENT: "A name being read, not declared. Whether it exists is Semantic Analysis's job: declare-before-use is not context-free.",
    TRUE: "The boolean literal 'true' — a complete Primary.",
    FALSE: "The boolean literal 'false' — a complete Primary.",
    LPAREN: "Opens a parenthesized sub-expression — everything up to the matching ')' is re-parsed as a full Expr.",
    RPAREN: "Closes the parenthesized sub-expression, confirming it's balanced before treating the whole thing as one Primary value.",
    LBRACKET: "Opens an array literal; its elements are an optional comma-separated Args list.",
    RBRACKET: "Closes the array literal.",
  },
};

export interface ParseExplainInput {
  move: "expand" | "match" | "accept" | "error";
  top: string;
  production?: Production;
  lookahead: Token;       // lookahead the move was decided on
  nextLookahead: Token;   // lookahead after the move
  newTop?: string;        // stack top after the move (undefined = empty)
  parent?: { symbol: string; production?: Production }; // rule that put `top` on the stack
  expected?: string[];
}

function nextCell(newTop: string | undefined, t: Token): string {
  if (newTop === undefined) return "Stack empty and all input read — the PDA accepts.";
  const tt = termText(t.kind);
  if (isNonTerminal(newTop)) return `Top is ${newTop}: look up M[${newTop}, ${tt}] to pick its production.`;
  if (newTop === t.kind) return `Top is ${symText(newTop)}, equal to the lookahead '${lx(t)}' — match it.`;
  return `Top is ${symText(newTop)} but the lookahead is '${lx(t)}' — no move exists; a syntax error follows.`;
}

export function explainParse(i: ParseExplainInput): Explanation {
  const t = i.lookahead;
  const tt = termText(t.kind);

  if (i.move === "expand" && i.production) {
    const p = i.production;
    const plain = EXPAND_PLAIN[p.lhs]?.(lx(t));
    const base = p.rhs.length
      ? `Expand ${p.lhs}: pop it, push ${rhsText(p)}${p.rhs.length > 1 ? ` (reversed, so ${symText(p.rhs[0])} is on top)` : ""}.`
      : `Expand ${p.lhs} → ε: pop it and push nothing — it derives the empty string here.`;
    return {
      what: plain && base.length + plain.length < 158 ? `${plain} ${base}` : base,
      why: expandWhy(p, t),
      formal: `M[${p.lhs}, ${tt}] = ${productionText(p)}`,
      next: nextCell(i.newTop, i.nextLookahead),
    };
  }

  if (i.move === "match") {
    if (t.kind === "EOF") {
      return {
        what: "Match EOF: the end-of-input token is popped — every token has now been read.",
        why: "EOF plays the textbook $ end-marker. Program → DeclList EOF matches it explicitly, so a program can't stop early or run on.",
        formal: "δ(q, EOF, EOF) = (q, ε) — the match move for the end-marker",
        next: nextCell(i.newTop, i.nextLookahead),
      };
    }
    const reason = i.parent && CONSUME_REASONS[i.parent.symbol]?.[t.kind];
    const fallback = i.parent?.production
      ? `${productionText(i.parent.production)} puts ${symText(i.top)} exactly here, so the input must contain it now.`
      : `The grammar puts ${symText(i.top)} exactly here.`;
    const kindTag = t.lexeme === tt ? `'${lx(t)}'` : `${tt} '${lx(t)}'`;
    return {
      what: `Match ${kindTag}: the terminal on top equals the lookahead, so pop it and advance the input head.`,
      why: reason ?? fallback,
      formal: `δ(q, ${tt}, ${tt}) = (q, ε) — match: read ${tt}, pop ${tt}`,
      next: nextCell(i.newTop, i.nextLookahead),
    };
  }

  if (i.move === "accept") {
    return {
      what: "Accept: input fully read and stack empty.",
      why: "Every symbol pushed was either expanded or matched, so the tokens are a sentence of the grammar; the parse tree is the proof.",
      formal: "(q, ε, ε) — acceptance by empty stack; the input ∈ L(G)",
      next: "Build the AST from the parse tree, then Semantic Analysis (declare-before-use and types aren't context-free).",
    };
  }

  // error
  const expected = i.expected ?? [];
  if (isNonTerminal(i.top)) {
    const A = i.top;
    return {
      what: `Syntax error: M[${A}, ${tt}] is empty — no ${A} production can begin with '${lx(t)}'.`,
      why: NULLABLE.has(A)
        ? `'${tt}' ∉ FIRST of any ${A} alternative, and ${A} ⇒ ε doesn't help: '${tt}' ∉ FOLLOW(${A}). The deterministic PDA has no move.`
        : `'${tt}' ∉ FIRST(${A}) = ${setText([...FIRST[A]], 6)}, and ${A} can't derive ε. The deterministic PDA has no move.`,
      formal: `M[${A}, ${tt}] = ∅; expected one of ${setText(expected)}`,
      next: "The PDA halts and rejects. The partial trace stays playable; fix the source near the highlighted token.",
    };
  }
  return {
    what: `Syntax error: expected '${symText(i.top)}' but found '${lx(t)}'.`,
    why: i.parent?.production
      ? `${productionText(i.parent.production)} requires ${symText(i.top)} here; a terminal on top can only be matched, never expanded.`
      : `A terminal on top of the stack can only be matched, never expanded.`,
    formal: `δ(q, ${tt}, ${termText(i.top)}) undefined (${tt} ≠ ${termText(i.top)})`,
    next: "The PDA halts and rejects. The partial trace stays playable; fix the source near the highlighted token.",
  };
}

export function parseErrorMessage(found: Token, expected: string[]): string {
  const where = `${found.line}:${found.col}`;
  const list = expected.map(termText).join(", ");
  const got = found.kind === "EOF" ? "end of input" : `'${found.lexeme}'`;
  return expected.length === 1
    ? `Syntax error at ${where}: expected '${list}', found ${got}`
    : `Syntax error at ${where}: expected one of {${list}}, found ${got}`;
}

// Scrubber chapter label for the top-level item starting at token `pos`.
export function parseChapterLabel(tokens: Token[], pos: number): string {
  const t = tokens[pos];
  const next = tokens[pos + 1];
  switch (t.kind) {
    case "LET":
    case "FN":
      return next && next.kind === "IDENT" ? `${t.lexeme} ${next.lexeme}` : t.lexeme;
    case "LBRACE":
      return "block";
    case "IF": case "WHILE": case "FOR": case "PRINT": case "RETURN":
      return t.lexeme;
    default:
      return `${lx(t)} …`;
  }
}

export const EMPTY_PROGRAM_CHAPTER = "program";

// Short labels for the view chrome.
export const PARSE_UI = {
  tabs: { tree: "Parse tree", table: "LL(1) table", calls: "Call graph (recursive transition network)", grammar: "Grammar" },
  treeToggle: { tree: "Parse tree", ast: "AST" },
  grammarToggle: { bnf: "BNF (official)", ebnf: "EBNF (shorthand)" },
  noAst: "No AST — the parse did not succeed, so there is no finished tree to trim.",
  astNote: "AST is built from the finished parse tree after ACCEPT (punctuation dropped, chains collapsed, tails folded left).",
  callNote: "Call graph = one node per grammar rule (helper …List/…Opt/…Tail rules folded in). Frames = ancestors of the current tree node.",
  tableNote: "Rows: non-terminals · Columns: lookahead · Cell: production number. Empty cell = syntax error.",
  tableSkipped: "table not consulted (only expands look up M; a terminal on top is compared directly)",
  config: "PDA configuration",
  stack: "stack (top first)",
  input: "input (lookahead highlighted)",
  derivation: "leftmost derivation: matched │ stack",
  emptyStack: "(empty stack)",
  emptyTree: "(tree not started)",
} as const;
