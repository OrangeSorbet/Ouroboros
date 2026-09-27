// The syntax phase as a textbook deterministic PDA (CFG → PDA construction,
// Sipser §2.2), driven by the LL(1) table from ll1.ts. It has a single state;
// everything happens on the stack, which holds grammar symbols still
// *expected*. Two moves:
//   expand — top is a non-terminal A: pop it, push the right-hand side of
//            M[A, lookahead] reversed (so its first symbol is on top);
//   match  — top is a terminal equal to the lookahead: pop it, advance input.
// The stack starts as [Program]. There is no separate `$` bottom marker:
// Program → DeclList EOF matches the EOF token explicitly, so acceptance is
// by empty stack once EOF is matched (input fully read and stack empty).
//
// This replaces the old hand-written recursive descent: one table-driven PDA
// is the only engine, and the parse tree, AST, call graph and derivation
// strip are all derived from its trace, so no two views can disagree.
import type { Token } from "./tokens.ts";
import type { Chapter, PhaseResult, Span, TraceStep } from "./trace.ts";
import type { Program } from "./ast.ts";
import { PRODUCTIONS, START_SYMBOL, isNonTerminal, isHelper } from "./grammar.ts";
import { TABLE, expectedFor } from "./ll1.ts";
import { buildAst } from "./astBuilder.ts";
import { explainParse, parseChapterLabel, parseErrorMessage, EMPTY_PROGRAM_CHAPTER } from "./messages/parse.ts";

export type PdaMove = "expand" | "match" | "accept" | "error";

export interface ParseNode {
  id: number;           // creation order, 0 = root
  symbol: string;       // grammar symbol, or "ε" for an empty-production leaf
  children: ParseNode[];
  token?: Token;        // terminals, once matched
  productionId?: number; // non-terminals, once expanded
  helper: boolean;      // symbol is an EBNF→BNF helper (views dim these)
  createdAt: number;    // trace index of the expand that created this node
  doneAt?: number;      // trace index where it was expanded / matched
}

export interface ParseOutput {
  tree: ParseNode;
  ast: Program;
}

export interface PdaStep extends TraceStep {
  move: PdaMove;
  top: string;           // symbol the move acted on ("" for accept)
  production?: number;   // expand: id of the production M[top, lookahead]
  stackAfter: string[];  // bottom … top (top = last element)
  inputPos: number;      // index of `lookahead` in the token array
  lookahead: Token;
  treeNodeId?: number;   // parse-tree node expanded / matched / failed on
  matched: string[];     // lexemes matched so far (derivation strip)
  expected?: string[];   // error: the terminals that would have been legal
  tree: ParseNode;       // root of the parse tree (shared, grows over the trace;
                         // use createdAt/doneAt to render it as of this step)
}

interface StackEntry {
  node: ParseNode;
  parent?: ParseNode;
}

const tokenSpan = (t: Token): Span => ({ line: t.line, col: t.col, endLine: t.line, endCol: t.endCol });

export function parse(tokens: Token[]): PhaseResult<PdaStep, ParseOutput> {
  // The lexer always ends with EOF; guard anyway so parse() never throws.
  const toks: Token[] = tokens.length && tokens[tokens.length - 1].kind === "EOF"
    ? tokens
    : [...tokens, { kind: "EOF", lexeme: "", line: tokens.at(-1)?.line ?? 1, col: (tokens.at(-1)?.endCol ?? 0) + 1, endCol: (tokens.at(-1)?.endCol ?? 0) + 1 }];

  const trace: PdaStep[] = [];
  let nextId = 0;
  const mkNode = (symbol: string): ParseNode => ({
    id: nextId++,
    symbol,
    children: [],
    helper: isNonTerminal(symbol) && isHelper(symbol),
    createdAt: trace.length,
  });

  const root = mkNode(START_SYMBOL);
  const stack: StackEntry[] = [{ node: root }];
  const matched: string[] = [];
  const declStarts: { step: number; pos: number }[] = [];
  let pos = 0;
  const la = () => toks[Math.min(pos, toks.length - 1)];

  const record = (step: Omit<PdaStep, "stackAfter" | "matched" | "tree" | "span" | "explain" | "lookahead" | "inputPos">,
                  lookahead: Token, inputPos: number, parent?: ParseNode) => {
    const top = stack.at(-1)?.node.symbol;
    trace.push({
      ...step,
      stackAfter: stack.map((e) => e.node.symbol),
      inputPos,
      lookahead,
      matched: [...matched],
      tree: root,
      span: tokenSpan(lookahead),
      explain: explainParse({
        move: step.move,
        top: step.top,
        production: step.production === undefined ? undefined : PRODUCTIONS[step.production],
        lookahead,
        nextLookahead: la(),
        newTop: top,
        parent: parent && { symbol: parent.symbol, production: parent.productionId === undefined ? undefined : PRODUCTIONS[parent.productionId] },
        expected: step.expected,
      }),
    });
  };

  let error: { message: string; span: Span } | undefined;
  for (;;) {
    const lookahead = la();
    const inputPos = pos;
    const entry = stack.at(-1);

    if (!entry) {
      record({ move: "accept", top: "", treeNodeId: root.id }, lookahead, inputPos);
      break;
    }

    const { node, parent } = entry;
    const X = node.symbol;

    if (!isNonTerminal(X)) {
      if (X !== lookahead.kind) {
        const expected = [X];
        record({ move: "error", top: X, treeNodeId: node.id, expected }, lookahead, inputPos, parent);
        error = { message: parseErrorMessage(lookahead, expected), span: tokenSpan(lookahead) };
        break;
      }
      stack.pop();
      node.token = lookahead;
      node.doneAt = trace.length;
      matched.push(lookahead.kind === "EOF" ? "EOF" : lookahead.lexeme);
      pos++;
      record({ move: "match", top: X, treeNodeId: node.id }, lookahead, inputPos, parent);
      continue;
    }

    const pid = TABLE[X][lookahead.kind];
    if (pid === undefined) {
      const expected = expectedFor(X);
      record({ move: "error", top: X, treeNodeId: node.id, expected }, lookahead, inputPos, parent);
      error = { message: parseErrorMessage(lookahead, expected), span: tokenSpan(lookahead) };
      break;
    }

    const p = PRODUCTIONS[pid];
    stack.pop();
    node.productionId = pid;
    node.doneAt = trace.length;
    const kids = p.rhs.map(mkNode);
    if (kids.length) {
      node.children = kids;
    } else {
      // ε leaf: the tree shows that this non-terminal derived the empty string.
      const eps = mkNode("ε");
      eps.doneAt = trace.length;
      node.children = [eps];
    }
    for (let i = kids.length - 1; i >= 0; i--) stack.push({ node: kids[i], parent: node });
    // Decl is only derivable from DeclList, so every Decl is a top-level item.
    if (X === "Decl") declStarts.push({ step: trace.length, pos });
    record({ move: "expand", top: X, production: pid, treeNodeId: node.id }, lookahead, inputPos, parent);
  }

  const chapters: Chapter[] = declStarts.map((d, i) => ({
    start: i === 0 ? 0 : d.step,
    end: i + 1 < declStarts.length ? declStarts[i + 1].step - 1 : trace.length - 1,
    label: parseChapterLabel(toks, d.pos),
  }));
  if (!chapters.length) chapters.push({ start: 0, end: trace.length - 1, label: EMPTY_PROGRAM_CHAPTER });

  if (error) return { ok: false, trace, chapters, error };
  return { ok: true, trace, chapters, output: { tree: root, ast: buildAst(root) } };
}
