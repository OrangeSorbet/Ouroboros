// View A of the parser (plan §5.9): the *call graph* — one node per grammar
// rule, an edge A → B when some production of A mentions B. Formally this is
// a recursive transition network, not the textbook PDA; the PDA is the stack
// of grammar symbols in parser.ts. Both are derived from grammar.ts, so an
// edge can never be missing (the old hand-written graph lacked Unary → Unary).
//
// Helper non-terminals (…List/…Opt/…Tail/…Op) are an artifact of the EBNF →
// BNF conversion, so they are folded into the rule that introduced them:
// Additive → AdditiveTail → Multiplicative shows as Additive → Multiplicative.
import { PRODUCTIONS, NON_TERMINALS, isHelper, isNonTerminal, symText } from "./grammar.ts";
import type { ParseNode } from "./parser.ts";

export const CALL_NODES: string[] = NON_TERMINALS.filter((nt) => !isHelper(nt));

function callees(nt: string, seen = new Set<string>()): Set<string> {
  const out = new Set<string>();
  seen.add(nt);
  for (const p of PRODUCTIONS) {
    if (p.lhs !== nt) continue;
    for (const s of p.rhs) {
      if (!isNonTerminal(s)) continue;
      if (!isHelper(s)) out.add(s);
      else if (!seen.has(s)) for (const x of callees(s, seen)) out.add(x);
    }
  }
  return out;
}

export const CALL_EDGES: { from: string; to: string }[] = CALL_NODES.flatMap((from) =>
  [...callees(from)].map((to) => ({ from, to })),
);

// Parent links, built once per finished tree (the parse tree never loses
// nodes, so ancestor chains computed on the final tree hold at every step).
const parentMaps = new WeakMap<ParseNode, Map<number, { node: ParseNode; parent?: ParseNode }>>();
function indexTree(root: ParseNode) {
  let map = parentMaps.get(root);
  if (map) return map;
  map = new Map();
  const walk = (n: ParseNode, parent?: ParseNode) => {
    map!.set(n.id, { node: n, parent });
    n.children.forEach((c) => walk(c, n));
  };
  walk(root);
  parentMaps.set(root, map);
  return map;
}

// Root … node (inclusive). In recursive-descent terms: the call stack.
export function ancestors(root: ParseNode, nodeId: number): ParseNode[] {
  const map = indexTree(root);
  const chain: ParseNode[] = [];
  for (let e = map.get(nodeId); e; e = e.parent ? map.get(e.parent.id) : undefined) chain.unshift(e.node);
  return chain;
}

export interface Frame {
  symbol: string;
  nodeId: number;
  dotted: string; // e.g. "LetStmt → let IDENT • = Expr ;"
}

// Frame list for the call-graph tab: every expanded non-helper ancestor of
// the current node, with a dotted rule (plan §5.15) — the dot sits before the
// child the parse is currently inside; everything left of it is finished.
export function callFrames(root: ParseNode, nodeId: number, move: string): Frame[] {
  const chain = ancestors(root, nodeId);
  const frames: Frame[] = [];
  chain.forEach((n, i) => {
    if (n.helper || n.productionId === undefined) return;
    const p = PRODUCTIONS[n.productionId];
    const child = chain[i + 1];
    let dot = child ? n.children.indexOf(child) : move === "accept" ? p.rhs.length : 0;
    if (child && child.id === nodeId && move === "match") dot += 1;
    const syms = p.rhs.map(symText);
    frames.push({
      symbol: n.symbol,
      nodeId: n.id,
      dotted: `${p.lhs} → ${[...syms.slice(0, dot), "•", ...syms.slice(dot)].join(" ")}`,
    });
  });
  return frames;
}
