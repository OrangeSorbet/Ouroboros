// Parse tree → AST. The parse tree is the *proof* that the tokens derive
// from the grammar (every helper, chain rule and punctuation leaf included);
// the AST keeps only what later phases need:
//   - punctuation (`;` `(` `=` …) dropped — its job was structural;
//   - chain rules (Expr → LogicOr → … → Primary) collapsed to the node that
//     actually carries an operator or value;
//   - …Tail recursion folded LEFT: the BNF tail makes the tree right-leaning
//     (1 - 2 - 3 hangs to the right), but the operators are left-associative,
//     so the fold builds (1 - 2) - 3;
//   - SimpleStmt with a non-ε AssignTail becomes AssignStmt (the grammar was
//     left-factored, so assignment is only recognised after the target Expr).
import type { ParseNode } from "./parser.ts";
import type { Span } from "./trace.ts";
import type {
  Program, Decl, FuncDecl, ClassDecl, FieldDecl, AbstractMethod, Param, Stmt, LetStmt, AssignStmt, ExprStmt, IfStmt, WhileStmt,
  ForStmt, ForEachStmt, ReturnStmt, PrintStmt, Block, Expr, BinaryOperator,
} from "./ast.ts";

export function buildAst(root: ParseNode): Program {
  let nextId = 0;
  const id = () => nextId++;

  const firstTok = (n: ParseNode): ParseNode | undefined =>
    n.token ? n : n.children.map(firstTok).find((x) => x);
  const lastTok = (n: ParseNode): ParseNode | undefined =>
    n.token ? n : [...n.children].reverse().map(lastTok).find((x) => x);
  const join = (a: Span, b: Span): Span => ({ line: a.line, col: a.col, endLine: b.endLine, endCol: b.endCol });
  const tokSpan = (n: ParseNode): Span => {
    const t = n.token!;
    return { line: t.line, col: t.col, endLine: t.line, endCol: t.endCol };
  };
  const spanOf = (n: ParseNode): Span => join(tokSpan(firstTok(n)!), tokSpan(lastTok(n)!));
  const isEps = (n: ParseNode) => n.children.length === 1 && n.children[0].symbol === "ε";
  const c = (n: ParseNode, i: number) => n.children[i];

  // Walks a right-recursive list helper (DeclList, StmtList, ParamsTail, ArgsTail)
  // and collects the element at `elem` on each level; `rest` is the recursive child.
  const list = (n: ParseNode, elem: number, rest: number): ParseNode[] => {
    const out: ParseNode[] = [];
    for (let cur = n; !isEps(cur); cur = c(cur, rest)) out.push(c(cur, elem));
    return out;
  };

  function program(n: ParseNode): Program {
    const items = list(c(n, 0), 0, 1).map(decl);
    return { kind: "Program", id: id(), span: spanOf(n), items };
  }

  function decl(n: ParseNode): Decl {
    const inner = c(n, 0);
    if (inner.symbol === "FuncDecl") return funcDecl(inner);
    if (inner.symbol === "ClassDecl") return classDecl(inner);
    return statement(inner);
  }

  // ClassDecl → AbstractOpt class IDENT ParentOpt { MemberList }
  // Member → VisOpt MemberBody; MemberBody → FieldDecl | FuncDecl | AbstractFn
  function classDecl(n: ParseNode): ClassDecl {
    const parentOpt = c(n, 3);
    const fields: FieldDecl[] = [];
    const methods: FuncDecl[] = [];
    const abstractMethods: AbstractMethod[] = [];
    for (const m of list(c(n, 5), 0, 1)) {
      const priv = !isEps(c(m, 0));
      const inner = c(c(m, 1), 0);
      if (inner.symbol === "FuncDecl") { methods.push({ ...funcDecl(inner), priv }); continue; }
      if (inner.symbol === "AbstractFn") { // abstract fn IDENT ( ParamsOpt ) ;
        abstractMethods.push({ kind: "AbstractMethod", id: id(), span: spanOf(inner), name: c(inner, 2).token!.lexeme, params: params(c(inner, 4)) });
        continue;
      }
      const initOpt = c(inner, 2); // FieldDecl → let IDENT FieldInit ;
      fields.push({
        kind: "FieldDecl", id: id(), span: spanOf(inner), name: c(inner, 1).token!.lexeme, priv,
        init: isEps(initOpt) ? null : expr(c(initOpt, 1)),
      });
    }
    return {
      kind: "ClassDecl", id: id(), span: spanOf(n), name: c(n, 2).token!.lexeme, abstract: !isEps(c(n, 0)),
      parent: isEps(parentOpt) ? null : c(parentOpt, 1).token!.lexeme, fields, methods, abstractMethods,
    };
  }

  // ParamsOpt → Params | ε (shared by fn declarations and abstract fns)
  function params(paramsOpt: ParseNode): Param[] {
    const out: Param[] = [];
    if (!isEps(paramsOpt)) {
      const ps = c(paramsOpt, 0);
      for (const tok of [c(ps, 0), ...list(c(ps, 1), 1, 2)]) {
        out.push({ kind: "Param", id: id(), span: tokSpan(tok), name: tok.token!.lexeme });
      }
    }
    return out;
  }

  function funcDecl(n: ParseNode): FuncDecl {
    return { kind: "FuncDecl", id: id(), span: spanOf(n), name: c(n, 1).token!.lexeme, params: params(c(n, 3)), body: block(c(n, 5)) };
  }

  function statement(n: ParseNode): Stmt {
    const s = c(n, 0);
    switch (s.symbol) {
      case "LetStmt": return letStmt(s);
      case "PrintStmt": return { kind: "PrintStmt", id: id(), span: spanOf(s), value: expr(c(s, 1)) } satisfies PrintStmt;
      case "IfStmt": {
        const elseOpt = c(s, 5);
        return {
          kind: "IfStmt", id: id(), span: spanOf(s), condition: expr(c(s, 2)), thenBranch: block(c(s, 4)),
          elseBranch: isEps(elseOpt) ? null : block(c(elseOpt, 1)),
        } satisfies IfStmt;
      }
      case "WhileStmt": return { kind: "WhileStmt", id: id(), span: spanOf(s), condition: expr(c(s, 2)), body: block(c(s, 4)) } satisfies WhileStmt;
      case "ForStmt": return forStmt(s);
      case "ReturnStmt": {
        const opt = c(s, 1);
        return { kind: "ReturnStmt", id: id(), span: spanOf(s), value: isEps(opt) ? null : expr(c(opt, 0)) } satisfies ReturnStmt;
      }
      case "Block": return block(s);
      default: return simpleStmt(c(s, 0), spanOf(s)); // ExprStmt → SimpleStmt ;
    }
  }

  function letStmt(n: ParseNode): LetStmt {
    return { kind: "LetStmt", id: id(), span: spanOf(n), name: c(n, 1).token!.lexeme, value: expr(c(n, 3)) };
  }

  // SimpleStmt → Expr AssignTail. `span` is passed in because ExprStmt's span
  // includes its `;`, while a for-loop update has none.
  function simpleStmt(n: ParseNode, span: Span): AssignStmt | ExprStmt {
    const tail = c(n, 1);
    const lhs = expr(c(n, 0));
    if (isEps(tail)) return { kind: "ExprStmt", id: id(), span, expr: lhs };
    return { kind: "AssignStmt", id: id(), span, target: lhs, value: expr(c(tail, 1)) };
  }

  // ForStmt → for ForRest; ForRest is either the C-style header or
  // `IDENT in Expr Block` (left-factored on `for`, so one lookahead picks).
  function forStmt(n: ParseNode): ForStmt | ForEachStmt {
    const r = c(n, 1);
    if (c(r, 0).symbol === "IDENT") {
      return { kind: "ForEachStmt", id: id(), span: spanOf(n), name: c(r, 0).token!.lexeme, iterable: expr(c(r, 2)), body: block(c(r, 3)) };
    }
    const initNode = c(c(r, 1), 0); // ForInit → LetStmt | ExprStmt | ;
    const init = initNode.symbol === "LetStmt" ? letStmt(initNode)
      : initNode.symbol === "ExprStmt" ? simpleStmt(c(initNode, 0), spanOf(initNode))
      : null;
    const condOpt = c(r, 2);
    const updOpt = c(r, 4);
    return {
      kind: "ForStmt", id: id(), span: spanOf(n), init,
      condition: isEps(condOpt) ? null : expr(c(condOpt, 0)),
      update: isEps(updOpt) ? null : simpleStmt(c(updOpt, 0), spanOf(updOpt)),
      body: block(c(r, 6)),
    };
  }

  function block(n: ParseNode): Block {
    return { kind: "Block", id: id(), span: spanOf(n), statements: list(c(n, 1), 0, 1).map(statement) };
  }

  const BINARY_LAYERS = new Set(["LogicOr", "LogicAnd", "Equality", "Comparison", "Additive", "Multiplicative"]);

  function expr(n: ParseNode): Expr {
    switch (n.symbol) {
      case "Expr": return expr(c(n, 0));
      case "Unary": {
        if (n.children.length === 1) return expr(c(n, 0));
        const op = c(n, 0).token!.lexeme as "-" | "!";
        const operand = expr(c(n, 1));
        return { kind: "UnaryExpr", id: id(), span: join(tokSpan(c(n, 0)), operand.span), operator: op, operand };
      }
      case "Postfix": return postfix(n);
      case "Primary": return primary(n);
      default:
        if (BINARY_LAYERS.has(n.symbol)) return foldTail(n);
        throw new Error(`astBuilder: unexpected expression node ${n.symbol}`);
    }
  }

  // Layer → Sub Tail, Tail → op Sub Tail | ε. `op` is a terminal (|| &&) or an
  // operator-group helper (EqOp …) whose only child is the terminal.
  function foldTail(n: ParseNode): Expr {
    let left = expr(c(n, 0));
    for (let tail = c(n, 1); !isEps(tail); tail = c(tail, 2)) {
      const opNode = c(tail, 0);
      const op = (opNode.token ?? c(opNode, 0).token)!.lexeme;
      const right = expr(c(tail, 1));
      const span = join(left.span, right.span);
      left = op === "&&" || op === "||"
        ? { kind: "LogicalExpr", id: id(), span, operator: op, left, right }
        : { kind: "BinaryExpr", id: id(), span, operator: op as BinaryOperator, left, right };
    }
    return left;
  }

  // Postfix → Primary PostfixTail; each non-ε tail wraps what's built so far,
  // so f(x)[0] becomes Index(Call(f, x), 0) and xs.push(1) becomes
  // Call(Member(xs, push), 1) — also a left fold.
  function postfix(n: ParseNode): Expr {
    let e = expr(c(n, 0));
    for (let tail = c(n, 1); !isEps(tail); tail = c(tail, tail.children.length - 1)) {
      if (c(tail, 0).symbol === "DOT") {
        const nameTok = c(tail, 1);
        e = { kind: "MemberExpr", id: id(), span: join(e.span, tokSpan(nameTok)), object: e, name: nameTok.token!.lexeme };
        continue;
      }
      const close = tokSpan(c(tail, 2));
      e = c(tail, 0).symbol === "LPAREN"
        ? { kind: "CallExpr", id: id(), span: join(e.span, close), callee: e, args: argsOpt(c(tail, 1)) }
        : { kind: "IndexExpr", id: id(), span: join(e.span, close), object: e, index: expr(c(tail, 1)) };
    }
    return e;
  }

  function argsOpt(n: ParseNode): Expr[] {
    if (isEps(n)) return [];
    const args = c(n, 0); // Args → Expr ArgsTail
    return [c(args, 0), ...list(c(args, 1), 1, 2)].map(expr);
  }

  function primary(n: ParseNode): Expr {
    const first = c(n, 0);
    const t = first.token!;
    const span = spanOf(n);
    switch (t.kind) {
      case "NUMBER": return { kind: "NumberLiteral", id: id(), span, value: BigInt(t.lexeme) };
      case "FLOAT": return { kind: "FloatLiteral", id: id(), span, value: Number(t.lexeme) };
      case "NONE": return { kind: "NoneLiteral", id: id(), span, value: null };
      case "STRING": return { kind: "StringLiteral", id: id(), span, value: t.value ?? t.lexeme.slice(1, -1) };
      case "IDENT": return { kind: "Identifier", id: id(), span, name: t.lexeme };
      case "TRUE": return { kind: "BoolLiteral", id: id(), span, value: true };
      case "FALSE": return { kind: "BoolLiteral", id: id(), span, value: false };
      case "LPAREN": return expr(c(n, 1)); // parentheses only grouped; the tree shape already records it
      case "AT": return atLit(c(n, 1), span);
      case "SELF": return { kind: "SelfExpr", id: id(), span };
      case "SUPER": return { kind: "SuperExpr", id: id(), span, name: c(n, 2).token!.lexeme };
      case "NEW": return { kind: "NewExpr", id: id(), span, className: c(n, 1).token!.lexeme, args: argsOpt(c(n, 3)) };
      default: return { kind: "ArrayLiteral", id: id(), span, elements: argsOpt(c(n, 1)) }; // [ ArgsOpt ]
    }
  }

  // AtLit → ( ArgsOpt ) | [ ArgsOpt ] | { PairsOpt }
  function atLit(n: ParseNode, span: Span): Expr {
    const open = c(n, 0).symbol;
    if (open === "LPAREN") return { kind: "ScaleLiteral", id: id(), span, elements: argsOpt(c(n, 1)) };
    if (open === "LBRACKET") return { kind: "ClutchLiteral", id: id(), span, elements: argsOpt(c(n, 1)) };
    const entries: { key: Expr; value: Expr }[] = [];
    const opt = c(n, 1);
    if (!isEps(opt)) {
      const pairs = c(opt, 0); // Pairs → Expr : Expr PairsTail
      entries.push({ key: expr(c(pairs, 0)), value: expr(c(pairs, 2)) });
      for (let t = c(pairs, 3); !isEps(t); t = c(t, 4)) entries.push({ key: expr(c(t, 1)), value: expr(c(t, 3)) });
    }
    return { kind: "DenLiteral", id: id(), span, entries };
  }

  return program(root);
}
