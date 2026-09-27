import type { Token } from "./tokens";
import { TokenKind } from "./tokens";
import type {
  Program, Stmt, Expr, Block,
  LetStmt, AssignStmt, PrintStmt, IfStmt, WhileStmt, ExprStmt,
} from "./ast";

// The parser is a recursive-descent implementation of the CFG in
// snek-grammar.md — one function per non-terminal. It behaves like a
// PDA: entering a non-terminal's function is a PUSH of that symbol
// onto the parse stack, returning from it is a POP. We track that
// stack explicitly (rather than relying on the JS call stack alone)
// so Phase 3/4 can animate it exactly like the DFA trace.

export type PdaAction = "push" | "pop" | "consume";

export interface PdaStep {
  action: PdaAction;
  symbol: string;      // the non-terminal being entered/exited, or (for
                        // "consume") the rule that matched the terminal
  stackAfter: string[]; // full stack snapshot after this step
  tokenLexeme: string;  // the token being looked at when this happened
  tokenKind: TokenKind; // that token's kind
  tokenIndex: number;   // index of that token in the full token array
  line: number;
}

export class ParseError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(message);
    this.line = line;
  }
}

export class Parser {
  private pos = 0;
  private stack: string[] = [];
  private tokens: Token[];
  public trace: PdaStep[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }

  private check(kind: TokenKind): boolean {
    return this.peek().kind === kind;
  }

  // Every terminal token consumed gets its own trace step — without this,
  // tokens consumed outside enter()/exit() never appeared in the trace at
  // all: the code-pane highlight, token list, and description would
  // silently skip them since no PdaStep's tokenIndex ever pointed at them.
  private traceConsume(context: string) {
    const tok = this.peek();
    this.trace.push({
      action: "consume",
      symbol: this.stack[this.stack.length - 1] ?? context,
      stackAfter: [...this.stack],
      tokenLexeme: tok.lexeme,
      tokenKind: tok.kind,
      tokenIndex: this.pos,
      line: tok.line,
    });
  }

  // For tokens whose kind still needs checking (the grammar requires
  // exactly this one here, or it's a syntax error).
  private expect(kind: TokenKind, context: string): Token {
    if (!this.check(kind)) {
      throw new ParseError(
        `Expected ${kind} while parsing ${context}, got ${this.peek().kind} ('${this.peek().lexeme}')`,
        this.peek().line
      );
    }
    this.traceConsume(context);
    return this.advance();
  }

  // For tokens a caller has already confirmed via check()/peek() (an
  // operator inside a while-loop condition, a literal branch in
  // parsePrimary's switch) — still traced, just without a redundant
  // re-check of the kind.
  private consumeToken(context: string): Token {
    this.traceConsume(context);
    return this.advance();
  }

  // push/pop wrap every non-terminal function so the stack trace is
  // impossible to forget when adding a new production later.
  private enter(symbol: string) {
    this.stack.push(symbol);
    this.trace.push({
      action: "push",
      symbol,
      stackAfter: [...this.stack],
      tokenLexeme: this.peek().lexeme,
      tokenKind: this.peek().kind,
      tokenIndex: this.pos,
      line: this.peek().line,
    });
  }

  private exit(symbol: string) {
    this.stack.pop();
    this.trace.push({
      action: "pop",
      symbol,
      stackAfter: [...this.stack],
      tokenLexeme: this.peek().lexeme,
      tokenKind: this.peek().kind,
      tokenIndex: this.pos,
      line: this.peek().line,
    });
  }

  parseProgram(): Program {
    this.enter("Program");
    const statements: Stmt[] = [];
    while (!this.check(TokenKind.EOF)) {
      statements.push(this.parseStatement());
    }
    this.exit("Program");
    return { kind: "Program", statements };
  }

  private parseStatement(): Stmt {
    this.enter("Statement");
    let stmt: Stmt;
    switch (this.peek().kind) {
      case TokenKind.LET: stmt = this.parseLetStmt(); break;
      case TokenKind.PRINT: stmt = this.parsePrintStmt(); break;
      case TokenKind.IF: stmt = this.parseIfStmt(); break;
      case TokenKind.WHILE: stmt = this.parseWhileStmt(); break;
      case TokenKind.LBRACE: stmt = this.parseBlock(); break;
      case TokenKind.IDENT:
        // Two IDENT-led productions share this lookahead: `IDENT =` is an
        // AssignStmt, anything else (IDENT used inside a larger expression,
        // e.g. a bare `x;`) falls through to ExprStmt.
        stmt = this.tokens[this.pos + 1]?.kind === TokenKind.ASSIGN
          ? this.parseAssignStmt()
          : this.parseExprStmt();
        break;
      default: stmt = this.parseExprStmt();
    }
    this.exit("Statement");
    return stmt;
  }

  private parseLetStmt(): LetStmt {
    this.enter("LetStmt");
    this.expect(TokenKind.LET, "LetStmt");
    const name = this.expect(TokenKind.IDENT, "LetStmt").lexeme;
    this.expect(TokenKind.ASSIGN, "LetStmt");
    const value = this.parseExpr();
    this.expect(TokenKind.SEMI, "LetStmt");
    this.exit("LetStmt");
    return { kind: "LetStmt", name, value };
  }

  private parseAssignStmt(): AssignStmt {
    this.enter("AssignStmt");
    const name = this.expect(TokenKind.IDENT, "AssignStmt").lexeme;
    this.expect(TokenKind.ASSIGN, "AssignStmt");
    const value = this.parseExpr();
    this.expect(TokenKind.SEMI, "AssignStmt");
    this.exit("AssignStmt");
    return { kind: "AssignStmt", name, value };
  }

  private parsePrintStmt(): PrintStmt {
    this.enter("PrintStmt");
    this.expect(TokenKind.PRINT, "PrintStmt");
    const value = this.parseExpr();
    this.expect(TokenKind.SEMI, "PrintStmt");
    this.exit("PrintStmt");
    return { kind: "PrintStmt", value };
  }

  private parseIfStmt(): IfStmt {
    this.enter("IfStmt");
    this.expect(TokenKind.IF, "IfStmt");
    this.expect(TokenKind.LPAREN, "IfStmt");
    const condition = this.parseExpr();
    this.expect(TokenKind.RPAREN, "IfStmt");
    const thenBranch = this.parseBlock();
    let elseBranch: Block | null = null;
    if (this.check(TokenKind.ELSE)) {
      this.consumeToken("IfStmt");
      elseBranch = this.parseBlock();
    }
    this.exit("IfStmt");
    return { kind: "IfStmt", condition, thenBranch, elseBranch };
  }

  private parseWhileStmt(): WhileStmt {
    this.enter("WhileStmt");
    this.expect(TokenKind.WHILE, "WhileStmt");
    this.expect(TokenKind.LPAREN, "WhileStmt");
    const condition = this.parseExpr();
    this.expect(TokenKind.RPAREN, "WhileStmt");
    const body = this.parseBlock();
    this.exit("WhileStmt");
    return { kind: "WhileStmt", condition, body };
  }

  private parseBlock(): Block {
    this.enter("Block");
    this.expect(TokenKind.LBRACE, "Block");
    const statements: Stmt[] = [];
    while (!this.check(TokenKind.RBRACE)) {
      statements.push(this.parseStatement());
    }
    this.expect(TokenKind.RBRACE, "Block");
    this.exit("Block");
    return { kind: "Block", statements };
  }

  private parseExprStmt(): ExprStmt {
    this.enter("ExprStmt");
    const expr = this.parseExpr();
    this.expect(TokenKind.SEMI, "ExprStmt");
    this.exit("ExprStmt");
    return { kind: "ExprStmt", expr };
  }

  // --- expression grammar, precedence climbing, one fn per level ---

  private parseExpr(): Expr {
    return this.parseEquality();
  }

  private parseEquality(): Expr {
    this.enter("Equality");
    let left = this.parseComparison();
    while (this.check(TokenKind.EQ) || this.check(TokenKind.NEQ)) {
      const op = this.consumeToken("Equality").kind === TokenKind.EQ ? "==" : "!=";
      const right = this.parseComparison();
      left = { kind: "BinaryExpr", operator: op, left, right };
    }
    this.exit("Equality");
    return left;
  }

  private parseComparison(): Expr {
    this.enter("Comparison");
    let left = this.parseAdditive();
    const comparisonOps: TokenKind[] = [TokenKind.LT, TokenKind.GT, TokenKind.LTE, TokenKind.GTE];
    while (comparisonOps.includes(this.peek().kind)) {
      const opTok = this.consumeToken("Comparison");
      const op = opTok.kind === TokenKind.LT ? "<"
        : opTok.kind === TokenKind.GT ? ">"
        : opTok.kind === TokenKind.LTE ? "<="
        : ">=";
      const right = this.parseAdditive();
      left = { kind: "BinaryExpr", operator: op, left, right };
    }
    this.exit("Comparison");
    return left;
  }

  private parseAdditive(): Expr {
    this.enter("Additive");
    let left = this.parseMultiplicative();
    while (this.check(TokenKind.PLUS) || this.check(TokenKind.MINUS)) {
      const op = this.consumeToken("Additive").kind === TokenKind.PLUS ? "+" : "-";
      const right = this.parseMultiplicative();
      left = { kind: "BinaryExpr", operator: op, left, right };
    }
    this.exit("Additive");
    return left;
  }

  private parseMultiplicative(): Expr {
    this.enter("Multiplicative");
    let left = this.parseUnary();
    while (this.check(TokenKind.STAR) || this.check(TokenKind.SLASH)) {
      const op = this.consumeToken("Multiplicative").kind === TokenKind.STAR ? "*" : "/";
      const right = this.parseUnary();
      left = { kind: "BinaryExpr", operator: op, left, right };
    }
    this.exit("Multiplicative");
    return left;
  }

  private parseUnary(): Expr {
    this.enter("Unary");
    let result: Expr;
    if (this.check(TokenKind.MINUS)) {
      this.consumeToken("Unary");
      const operand = this.parseUnary();
      result = { kind: "UnaryExpr", operator: "-", operand };
    } else {
      result = this.parsePrimary();
    }
    this.exit("Unary");
    return result;
  }

  private parsePrimary(): Expr {
    this.enter("Primary");
    const tok = this.peek();
    let result: Expr;
    switch (tok.kind) {
      case TokenKind.NUMBER:
        this.consumeToken("Primary");
        result = { kind: "NumberLiteral", value: Number(tok.lexeme) };
        break;
      case TokenKind.IDENT:
        this.consumeToken("Primary");
        result = { kind: "Identifier", name: tok.lexeme };
        break;
      case TokenKind.TRUE:
        this.consumeToken("Primary");
        result = { kind: "BoolLiteral", value: true };
        break;
      case TokenKind.FALSE:
        this.consumeToken("Primary");
        result = { kind: "BoolLiteral", value: false };
        break;
      case TokenKind.LPAREN:
        this.consumeToken("Primary");
        result = this.parseExpr();
        this.expect(TokenKind.RPAREN, "Primary");
        break;
      default:
        throw new ParseError(`Unexpected token '${tok.lexeme}' in expression`, tok.line);
    }
    this.exit("Primary");
    return result;
  }
}

export function parse(tokens: Token[]): { program: Program; trace: PdaStep[] } {
  const parser = new Parser(tokens);
  const program = parser.parseProgram();
  return { program, trace: parser.trace };
}
