// Self-check for Semantic Analysis: node scripts/check-semantic.ts
// Uses the real lexer+parser when they produce an AST; otherwise falls back
// to hand-built AST fixtures so this check never depends on upstream state.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze } from "../src/compiler/semantic.ts";

let lex: any, parse: any;
try {
  ({ lex } = await import("../src/compiler/lexer.ts"));
  ({ parse } = await import("../src/compiler/parser.ts"));
} catch { /* upstream not loadable yet */ }

let usedReal = true;
function astOf(src: string, fixture: () => any) {
  try {
    const l = lex(src);
    const p = l?.ok ? parse(l.output) : null;
    if (p?.ok && p.output?.ast) return p.output.ast;
  } catch { /* fall through */ }
  usedReal = false;
  return fixture();
}

// ---- fixture builders ----
let nid = 0;
const sp = { line: 1, col: 1, endLine: 1, endCol: 1 };
const n = (o: any) => ({ ...o, id: ++nid, span: sp });
const num = (v: number) => n({ kind: "NumberLiteral", value: BigInt(v) });
const str = (v: string) => n({ kind: "StringLiteral", value: v });
const bool = (v: boolean) => n({ kind: "BoolLiteral", value: v });
const id = (name: string) => n({ kind: "Identifier", name });
const bin = (operator: string, left: any, right: any) =>
  n({ kind: operator === "&&" || operator === "||" ? "LogicalExpr" : "BinaryExpr", operator, left, right });
const call = (name: string, ...args: any[]) => n({ kind: "CallExpr", callee: id(name), args });
const let_ = (name: string, value: any) => n({ kind: "LetStmt", name, value });
const assign = (target: any, value: any) => n({ kind: "AssignStmt", target, value });
const print = (value: any) => n({ kind: "PrintStmt", value });
const block = (...statements: any[]) => n({ kind: "Block", statements });
const ret = (value: any) => n({ kind: "ReturnStmt", value });
const fn = (name: string, params: string[], body: any) =>
  n({ kind: "FuncDecl", name, params: params.map((p) => n({ kind: "Param", name: p })), body });
const prog = (...items: any[]) => n({ kind: "Program", items });

const demoFixture = () => prog(
  fn("square", ["n"], block(ret(bin("*", id("n"), id("n"))))),
  let_("limit", bin("+", num(1), num(2))),
  let_("total", num(0)),
  n({
    kind: "ForStmt",
    init: let_("i", num(0)),
    condition: bin("<", id("i"), id("limit")),
    update: assign(id("i"), bin("+", id("i"), num(1))),
    body: block(assign(id("total"), bin("+", id("total"), call("square", id("i"))))),
  }),
  let_("names", n({ kind: "ArrayLiteral", elements: [str("lo"), str("hi")] })),
  n({
    kind: "IfStmt",
    condition: bin("&&", bin(">", id("total"), num(4)), n({ kind: "UnaryExpr", operator: "!", operand: bool(false) })),
    thenBranch: block(print(n({ kind: "IndexExpr", object: id("names"), index: num(1) }))),
    elseBranch: block(print(id("total"))),
  }),
  n({ kind: "IfStmt", condition: bool(false), thenBranch: block(print(str("never"))), elseBranch: null }),
);

const read = (f: string) => readFileSync(new URL(`../src/samples/${f}`, import.meta.url), "utf8");

function assertExplained(r: any) {
  for (const s of r.trace) {
    for (const k of ["what", "why", "formal", "next"]) assert.ok(s.explain[k]?.length > 0, `empty ${k} at ${s.action}`);
    assert.ok(Array.isArray(s.scopes));
  }
}

function fails(src: string, fixture: () => any, what: RegExp) {
  const r = analyze(astOf(src, fixture));
  assertExplained(r);
  assert.equal(r.ok, false, `expected failure: ${src}`);
  assert.equal(r.trace.at(-1).action, "error");
  assert.match(r.error.message, what, src);
  return r;
}

function passes(src: string, fixture: () => any) {
  const r = analyze(astOf(src, fixture));
  assertExplained(r);
  assert.equal(r.ok, true, `expected pass: ${src} — ${r.error?.message}`);
  return r;
}

// demo.snek: slots and resolutions
{
  const ast = astOf(read("demo.snek"), demoFixture);
  const r = analyze(ast);
  assertExplained(r);
  assert.equal(r.ok, true, r.error?.message);
  const sem = r.output!;
  assert.deepEqual(sem.main.slotNames, ["limit", "total", "i", "names"]);
  assert.deepEqual(sem.functions.map((f) => [f.name, f.params, f.slotNames]), [["square", ["n"], ["n"]]]);
  // every Identifier resolved, every Expr typed
  const walk = (x: any, visit: (x: any) => void) => {
    if (x && typeof x === "object") {
      if (typeof x.kind === "string") visit(x);
      for (const v of Object.values(x)) if (v !== x.span) walk(v, visit);
    }
  };
  const byName: Record<string, any[]> = {};
  walk(ast, (x) => {
    if (x.kind === "Identifier") (byName[x.name] ??= []).push(sem.resolutions.get(x.id));
    if (/Expr|Literal|Identifier/.test(x.kind) && x.kind !== "ExprStmt") assert.ok(sem.types.has(x.id), `untyped ${x.kind}`);
  });
  assert.ok(byName.total.every((res) => res.kind === "local" && res.slot === 1 && res.code === "<main>"));
  assert.ok(byName.i.every((res) => res.kind === "local" && res.slot === 2));
  assert.ok(byName.n.every((res) => res.kind === "local" && res.slot === 0 && res.code === "square"));
  assert.deepEqual(byName.square, [{ kind: "function", name: "square" }]);
  assert.equal(r.chapters[0].label, "hoist fns");
  assert.ok(r.chapters.some((c) => c.label === "for"));
}

// err-semantic.snek: fails at `x + true`
{
  const r = fails(read("err-semantic.snek"),
    () => prog(let_("x", num(1)), let_("y", bin("+", id("x"), bool(true)))), /\+ applied to int and bool/);
  assert.match(r.trace.at(-1).explain.formal, /no rule for \+ : int × bool/);
}

fails("print y;", () => prog(print(id("y"))), /not declared/);
fails("let a = 1; let a = 2;", () => prog(let_("a", num(1)), let_("a", num(2))), /already declared/);
{
  const r = passes("let a = 1; { let a = true; print a; } print a;",
    () => prog(let_("a", num(1)), block(let_("a", bool(true)), print(id("a"))), print(id("a"))));
  assert.deepEqual(r.output!.main.slotNames, ["a", "a"]);
}
fails("if (5) { }", () => prog(n({ kind: "IfStmt", condition: num(5), thenBranch: block(), elseBranch: null })), /condition has type int/);
fails("fn f(a) { return a; } print f(1, 2);",
  () => prog(fn("f", ["a"], block(ret(id("a")))), print(call("f", num(1), num(2)))), /takes 1 argument/);
fails("return 1;", () => prog(ret(num(1))), /outside any function/);
fails("let g = 1; fn f() { return g; }",
  () => prog(let_("g", num(1)), fn("f", [], block(ret(id("g"))))), /top-level let/);
fails("1 = 2;", () => prog(assign(num(1), num(2))), /not an lvalue/);

console.log(`check-semantic: all assertions passed (${usedReal ? "real lex+parse" : "AST fixtures"})`);
