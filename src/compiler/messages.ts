// Human-readable text for the visualization layer — kept separate from
// dfa.ts/lexer.ts/parser.ts/steps.ts so the automaton logic never carries
// prose, and the wording can be tuned without touching scanning/parsing code.

// Grammar production text per non-terminal, mirrors docs/snek-grammar.md —
// used to make PDA push/pop steps readable without re-deriving the rule.
export const GRAMMAR_RULES: Record<string, string> = {
  Program: "Program -> Statement* EOF",
  Statement: "Statement -> LetStmt | AssignStmt | PrintStmt | IfStmt | WhileStmt | Block | ExprStmt",
  LetStmt: `LetStmt -> "let" IDENT "=" Expr ";"`,
  AssignStmt: `AssignStmt -> IDENT "=" Expr ";"`,
  PrintStmt: `PrintStmt -> "print" Expr ";"`,
  IfStmt: `IfStmt -> "if" "(" Expr ")" Block ( "else" Block )?`,
  WhileStmt: `WhileStmt -> "while" "(" Expr ")" Block`,
  Block: `Block -> "{" Statement* "}"`,
  ExprStmt: `ExprStmt -> Expr ";"`,
  Equality: `Equality -> Comparison ( ("==" | "!=") Comparison )*`,
  Comparison: `Comparison -> Additive ( ("<" | ">" | "<=" | ">=") Additive )*`,
  Additive: `Additive -> Multiplicative ( ("+" | "-") Multiplicative )*`,
  Multiplicative: `Multiplicative -> Unary ( ("*" | "/") Unary )*`,
  Unary: `Unary -> "-" Unary | Primary`,
  Primary: `Primary -> NUMBER | IDENT | "true" | "false" | "(" Expr ")"`,
};

export const dfaMessages = {
  epsilonAccept: (kind: string, lexeme: string) =>
    `Epsilon step — no new input consumed. The DFA has reached an accepting state and performs its acceptance action: emit ${kind} with lexeme "${lexeme}". It follows the ε-transition back to START before the next real character is read.`,

  acceptOnChar: (char: string, kind: string, lexeme: string) =>
    `Accepting on '${char}'. Token finalized -> ${kind} with lexeme "${lexeme}". The DFA follows the transition back to START and begins scanning the next token from the next unconsumed character.`,

  commentSelfLoop: (char: string) =>
    `delta(IN_COMMENT, '${char}') = IN_COMMENT. Comments are consumed character-by-character until a newline is reached and never produce a token — this is a pure self-loop with no emission at the end.`,

  fromStart: (char: string, to: string, lexemeNote: string) =>
    `delta(START, '${char}') = ${to}. The character class of '${char}' determines which branch of the DFA is entered — this is the first character of a new token.${lexemeNote}`,

  selfLoop: (state: string, char: string, lexemeNote: string) =>
    `delta(${state}, '${char}') = ${state} (self-loop). The character extends the current lexeme without changing state — the DFA keeps consuming while the run of matching characters continues.${lexemeNote}`,

  transition: (from: string, char: string, to: string, lexemeNote: string) =>
    `delta(${from}, '${char}') = ${to}. A state transition occurs on this character, moving the DFA one step closer to an accepting configuration.${lexemeNote}`,

  reject: (state: string, char: string) =>
    `delta(${state}, '${char}') = DEAD (reject). No transition is defined for this input — the DFA has no way to continue and the lexeme is rejected. This trap state is what keeps the automaton total: every (state, input) pair goes somewhere, even if that somewhere is "fail".`,
};

// Plain-English narration per non-terminal, told as a running story rather
// than formal push/pop jargon alone — describePdaStep() (steps.ts) still
// tags each line with the explicit PUSH/POP/consume action and where
// control returns to, but the sentence itself explains the *why*: which
// rule this is, why it loops or hands off where it does, and — for the
// expression-precedence chain specifically — why control returns to the
// level that pushed it rather than jumping straight back to the outermost
// level (each level only gets first refusal on its own operator, in strict
// precedence order, before the level above ever gets a turn).
export const pdaPlain: Record<string, { push: (tok: string) => string; pop: (returnsTo: string) => string }> = {
  Program: {
    push: () => "Parsing begins for the whole program.",
    pop: () => "Parsing complete — the entire program is syntactically valid, no grammar errors found.",
  },
  Statement: {
    push: (tok) => `'${tok}' seen — this starts a new statement.`,
    pop: () => "Statement verified — it matches the grammar with no errors.",
  },
  LetStmt: {
    push: () => "Starts with 'let' — this is a variable declaration.",
    pop: () => "Let-declaration verified — its syntax matches the grammar.",
  },
  AssignStmt: {
    push: (tok) => `'${tok}' is an existing name being reassigned (no 'let').`,
    pop: () => "Assignment verified — its syntax matches the grammar.",
  },
  PrintStmt: {
    push: () => "'print' seen — this statement outputs a value.",
    pop: () => "Print statement verified — its syntax matches the grammar.",
  },
  IfStmt: {
    push: () => "'if' seen — a conditional branch begins.",
    pop: () => "If-statement verified — condition and branch(es) all match the grammar.",
  },
  WhileStmt: {
    push: () => "'while' seen — a loop begins.",
    pop: () => "While-loop verified — condition and body match the grammar.",
  },
  Block: {
    push: () => "'{' seen — entering a block of statements.",
    pop: () => "Block verified — every statement inside it matched the grammar.",
  },
  ExprStmt: {
    push: (tok) => `'${tok}' isn't a keyword, so this is a bare expression statement.`,
    pop: () => "Expression statement verified — its syntax matches the grammar.",
  },
  // The four lines below describe what THIS push/pop is actually doing —
  // using the real returnsTo computed from this exact step's stack, not a
  // hardcoded guess at which level called it. Which rule is actually above
  // it on the stack varies by call site (Additive after a '+', but just as
  // easily IfStmt's condition, or Unary if there's no operator at all).
  Equality: {
    push: (tok) => `Reading '${tok}' — checking this part of the expression for == or !=.`,
    pop: (returnsTo) => `No (more) == or != here — hands its value up to ${returnsTo}.`,
  },
  Comparison: {
    push: (tok) => `Reading '${tok}' — checking for <, >, <=, or >=.`,
    pop: (returnsTo) => `No (more) comparison operator here — hands its value up to ${returnsTo}.`,
  },
  Additive: {
    push: (tok) => `Reading '${tok}' — checking for + or -, looping here for each one found before handing a combined value upward.`,
    pop: (returnsTo) => `No (more) + or - here — hands its combined value up to ${returnsTo}.`,
  },
  Multiplicative: {
    push: (tok) => `Reading '${tok}' — checking for * or /.`,
    pop: (returnsTo) => `No (more) * or / here — hands its value up to ${returnsTo}.`,
  },
  Unary: {
    push: (tok) => `Reading '${tok}' — checking only for a single leading '-' (negation).`,
    pop: (returnsTo) => `Sign resolved — hands its value up to ${returnsTo}.`,
  },
  Primary: {
    push: (tok) => `'${tok}' is the innermost value — a number, name, boolean, or a parenthesized expression.`,
    // Primary always pops back to whichever level pushed it (Unary, unless
    // this Primary was itself a parenthesized expression, in which case it
    // was Equality) — that return target is the real answer to "why does
    // it go back there", not a fixed guess.
    pop: (returnsTo) => `Value resolved — hands it back up to ${returnsTo}, the rule that called it.`,
  },
};

// Narration for a bare terminal-token consume (parser.ts's expect() /
// consumeToken()) — these aren't a grammar non-terminal push/pop, just a
// literal token match, but every one of them exists because the grammar
// production for the CURRENT rule requires exactly this token in exactly
// this position. Keyed by (rule, tokenKind) rather than tokenKind alone,
// since the same token means something different in different rules (an
// IDENT in LetStmt is the name being *declared*; the same IDENT kind in
// Primary is a name being *read*).
const CONSUME_REASONS: Record<string, Partial<Record<string, string>>> = {
  LetStmt: {
    LET: "The keyword that made Statement choose LetStmt over every other alternative.",
    IDENT: "Right after 'let', the grammar requires a name — this is the variable being declared.",
    ASSIGN: "Separates the declared name from its initial-value expression.",
    SEMI: "Closes the declaration.",
  },
  AssignStmt: {
    IDENT: "The name being reassigned — already confirmed to exist (it's not preceded by 'let').",
    ASSIGN: "Confirms this is a reassignment, not just a bare expression statement.",
    SEMI: "Closes the assignment.",
  },
  PrintStmt: {
    PRINT: "The keyword that made Statement choose PrintStmt.",
    SEMI: "Closes the print statement, after its expression.",
  },
  IfStmt: {
    IF: "The keyword that made Statement choose IfStmt.",
    LPAREN: "The grammar wraps the condition in parentheses, so it can't be confused with what follows.",
    RPAREN: "Closes the condition — everything after this is the body, not part of the condition.",
    ELSE: "An 'else' immediately after the then-branch's '}' means this if has an alternate branch.",
  },
  WhileStmt: {
    WHILE: "The keyword that made Statement choose WhileStmt.",
    LPAREN: "The grammar wraps the loop condition in parentheses.",
    RPAREN: "Closes the condition — everything after this is the loop body.",
  },
  Block: {
    LBRACE: "Marks where this block's statements begin.",
    RBRACE: "Marks where this block ends, so the Statement* loop above knows to stop and pop back out.",
  },
  ExprStmt: {
    SEMI: "Closes a statement that's just a bare expression (no keyword started it).",
  },
  Equality: {
    EQ: "Found — this becomes an equality comparison; both sides are combined into one BinaryExpr and the loop checks for another == or !=.",
    NEQ: "Found — this becomes an inequality comparison; both sides are combined into one BinaryExpr and the loop checks for another == or !=.",
  },
  Comparison: {
    LT: "Found — combined into one BinaryExpr, then the loop checks for another comparison operator.",
    GT: "Found — combined into one BinaryExpr, then the loop checks for another comparison operator.",
    LTE: "Found — combined into one BinaryExpr, then the loop checks for another comparison operator.",
    GTE: "Found — combined into one BinaryExpr, then the loop checks for another comparison operator.",
  },
  Additive: {
    PLUS: "Found — combined into one BinaryExpr, then the loop checks for another + or -.",
    MINUS: "Found — combined into one BinaryExpr, then the loop checks for another + or -.",
  },
  Multiplicative: {
    STAR: "Found — combined into one BinaryExpr, then the loop checks for another * or /.",
    SLASH: "Found — combined into one BinaryExpr, then the loop checks for another * or /.",
  },
  Unary: {
    MINUS: "A leading '-' — the operand is negated once Unary recurses into itself for whatever follows.",
  },
  Primary: {
    NUMBER: "A number literal — this alone is a complete Primary, nothing more to consume.",
    IDENT: "A name being read (looked up), not declared — this alone is a complete Primary.",
    TRUE: "The boolean literal 'true' — a complete Primary.",
    FALSE: "The boolean literal 'false' — a complete Primary.",
    LPAREN: "Opens a parenthesized sub-expression — everything up to the matching ')' is re-parsed as a full Expr (this is the recursion back into Equality).",
    RPAREN: "Closes the parenthesized sub-expression, confirming it's balanced before treating the whole thing as one Primary value.",
  },
};

export function pdaConsumeNote(rule: string, tokenKind: string): string {
  const specific = CONSUME_REASONS[rule]?.[tokenKind];
  const grammar = GRAMMAR_RULES[rule];
  if (specific) return grammar ? `${specific} (${grammar})` : specific;
  return grammar ? `Matched directly here, as required by: ${grammar}` : "Matched directly here.";
}
