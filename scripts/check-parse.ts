// Self-check for the syntax phase: node scripts/check-parse.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONFLICTS } from "../src/compiler/ll1.ts";
import { parse } from "../src/compiler/parser.ts";
import { lex } from "../src/compiler/lexer.ts";
import type { Token } from "../src/compiler/tokens.ts";
import type { AssignStmt, BinaryExpr, ExprStmt, ForStmt, Program } from "../src/compiler/ast.ts";

const sample = (name: string) => readFileSync(new URL(`../src/samples/${name}`, import.meta.url), "utf8");

function tokens(src: string): Token[] {
  const r = lex(src);
  assert.ok(r.ok && r.output, `lexer failed: ${r.error?.message}`);
  return r.output;
}

function parseOk(src: string): Program {
  const r = parse(tokens(src));
  assert.ok(r.ok && r.output, `parse failed: ${r.error?.message}`);
  return r.output.ast;
}

assert.deepEqual(CONFLICTS, [], "grammar must be LL(1)");

// demo.orbs: parses, ends in match EOF + accept, one chapter per top-level item.
const demo = parse(tokens(sample("demo.orbs")));
assert.ok(demo.ok, demo.error?.message);
assert.equal(demo.trace.at(-1)!.move, "accept");
assert.equal(demo.trace.at(-2)!.move, "match");
assert.equal(demo.trace.at(-2)!.top, "EOF");
assert.deepEqual(demo.trace.at(-1)!.stackAfter, []);
assert.deepEqual(demo.chapters.map((c) => c.label),
  ["fn square", "let limit", "let total", "for", "let names", "if", "if"]);
assert.equal(demo.output!.ast.items.length, 7);

// Every step fills all four explanation cells, within budget.
for (const r of [demo, parse(tokens(sample("err-parse.orbs")))]) {
  for (const s of r.trace) {
    for (const [k, v] of Object.entries(s.explain)) {
      assert.ok(v.length > 0, `empty ${k} at ${s.move} ${s.top}`);
      assert.ok(v.length <= 160, `${k} too long (${v.length}): ${v}`);
    }
  }
}

// Left-associative fold: 1 - 2 - 3 → (1 - 2) - 3.
const sub = (parseOk("1 - 2 - 3;").items[0] as ExprStmt).expr as BinaryExpr;
assert.equal(sub.operator, "-");
assert.equal((sub.left as BinaryExpr).operator, "-");
assert.equal(sub.right.kind, "NumberLiteral");

// Precedence: 1 + 2 * 3 → 1 + (2 * 3).
const add = (parseOk("1 + 2 * 3;").items[0] as ExprStmt).expr as BinaryExpr;
assert.equal(add.right.kind, "BinaryExpr");

// Left-factored assignment: a[i] = 5 → AssignStmt with an IndexExpr target.
const asg = parseOk("a[i] = 5;").items[0] as AssignStmt;
assert.equal(asg.kind, "AssignStmt");
assert.equal(asg.target.kind, "IndexExpr");

// For-loop fields.
const loop = parseOk("for (let i = 0; i < 3; i = i + 1) { print i; }").items[0] as ForStmt;
assert.equal(loop.init?.kind, "LetStmt");
assert.equal(loop.condition?.kind, "BinaryExpr");
assert.equal(loop.update?.kind, "AssignStmt");
assert.equal(loop.body.statements.length, 1);
const bare = parseOk("for (;;) {}").items[0] as ForStmt;
assert.deepEqual([bare.init, bare.condition, bare.update], [null, null, null]);

// Unique AST ids.
const ids: number[] = [];
JSON.stringify(demo.output!.ast, (k, v) => (k === "id" && ids.push(v), typeof v === "bigint" ? String(v) : v));
assert.equal(new Set(ids).size, ids.length, "AST ids must be unique");

// err-parse.orbs (`let = 5;`): fails at '=' with an expected set, trace kept.
const bad = parse(tokens(sample("err-parse.orbs")));
assert.equal(bad.ok, false);
const last = bad.trace.at(-1)!;
assert.equal(last.move, "error");
assert.deepEqual(last.expected, ["IDENT"]);
assert.equal(last.lookahead.kind, "ASSIGN");
assert.match(bad.error!.message, /expected 'IDENT'/);

// `fn` inside a block is a syntax error (Decl is only reachable from Program).
const nested = parse(tokens("{ fn f() {} }"));
assert.equal(nested.ok, false);
assert.ok(nested.trace.at(-1)!.expected!.length > 1);

console.log(`check-parse ok (${demo.trace.length} PDA steps for demo.orbs)`);
