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

// demo.orbs: slots and resolutions
{
  const ast = astOf(read("demo.orbs"), demoFixture);
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

// err-semantic.orbs: fails at `x + true`
{
  const r = fails(read("err-semantic.orbs"),
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

// M1 (floats, %, none, built-ins) — real parser only, no hand fixtures.
const realOnly = () => { throw new Error("M1 cases need the real lexer + parser"); };
passes("let a = 1.5 + 2; print a * 2; print -a;", realOnly);
fails("print 1.5 % 2;", realOnly, /% applied to float and int/);
fails("let s = \"a\" + 1.5;", realOnly, /\+ applied to string and float/);
passes("let n = none; n = 3; print n == none; print 1 == 1.0;", realOnly);
passes("print len(\"abc\") + len([1, 2]); print str(1.5) + \"!\"; print int(\"4\") + 1; print float(2) / 3;", realOnly);
fails("print len(5);", realOnly, /len\(\) cannot take int/);
fails("print float(true);", realOnly, /float\(\) cannot take bool/);
fails("let f = len;", realOnly, /len/);
passes("fn len(x) { return 0; } print len(5);", realOnly); // a user fn shadows the built-in
fails("print len(1, 2);", realOnly, /takes 1 argument/);

// M2: coil / scale / den / clutch, methods, for-each.
passes("let xs = [1]; xs.push(2); print xs.pop() + 1; print xs.has(1);", realOnly);
fails("let xs = [1]; xs.push(\"a\");", realOnly, /expects int, got string/);
fails("let xs = [1]; xs.shove(2);", realOnly, /has no method shove/);
fails("let xs = [1]; print xs.push;", realOnly, /must be called/);
fails("let p = @(1, 2); p[0] = 5;", realOnly, /scales are immutable/);
fails("let p = @(1, 2); print p[5];", realOnly, /cannot index scale<int, int> with int/);
passes("let p = @(1, \"a\"); print p[1] + \"b\";", realOnly); // literal index → that position's type
fails("let d = @{[1]: 2};", realOnly, /not hashable/);
fails("let d = @{\"a\": 1, 2: 3};", realOnly, /den key literal mixes string and int/);
passes("let d = @{\"a\": 1}; d[\"b\"] = 2; print d[\"a\"] + len(d); for k in d { print k + \"!\"; }", realOnly);
fails("for x in 5 { }", realOnly, /cannot loop over int/);
passes("let c = @[1, 2]; c.add(3); print c.has(1) && len(c) == 3;", realOnly);
fails("let c = @[[1]];", realOnly, /not hashable/);
passes("fn f(z) { return z.len(); } print f([1]);", realOnly); // unknown receiver: the VM checks
{
  const r = passes("for x in [1, 2] { print x; }", realOnly);
  assert.deepEqual(r.output!.main.slotNames, ["x"], "loop variable gets a slot");
}

// M3: classes, inheritance, self / super / new.
{
  const r = passes(read("zoo.orbs"), realOnly);
  const sem = r.output!;
  assert.deepEqual(sem.classes.map((c) => [c.name, c.parent, c.fields, Object.keys(c.methods), c.fieldsCode]), [
    ["Animal", null, ["name", "legs"], ["init/1", "speak/0", "intro/0"], "Animal.<fields>"],
    ["Snake", "Animal", ["legs"], ["speak/0", "intro/0"], "Snake.<fields>"],
  ]);
  const intro = sem.functions.find((f) => f.name === "Animal.intro")!;
  assert.deepEqual(intro.slotNames, ["self"], "self in slot 0");
  assert.ok(r.trace.some((s) => s.explain.what.includes("Snake inherits along Snake → Animal")));
}
fails("class A : B { }", realOnly, /extends B, but no class B/);
fails(read("err-cycle.orbs"), realOnly, /inheritance cycle Egg → Snake → Egg/);
fails("class A { let x; let x; }", realOnly, /declares x twice/);
fails(read("err-self.orbs"), realOnly, /self used outside/);
fails("class A { fn f() { return super.g(); } }", realOnly, /no parent class/);
fails("let a = new Nope();", realOnly, /no class Nope/);
fails("class A { fn init(x) { } } let a = new A();", realOnly, /init takes 1 argument/);
fails(read("err-no-field.orbs"), realOnly, /Point has no field z/);
fails("class A { fn f() { } } let a = new A(); print a.f;", realOnly, /must be called/);
fails("class A { } let a = new A(); a.g();", realOnly, /A has no method g/);
fails("class A { } print A;", realOnly, /A is a class/);
fails("class A { } fn A() { }", realOnly, /already declared/);
passes("class A { } class B : A { } let x = new A(); x = new B(); print x == x;", realOnly); // a B is an A

// M4: priv, abstract, overloading by arity.
fails(read("err-private.orbs"), realOnly, /balance is private to Account; it cannot be used outside the class/);
fails("class A { priv fn f() { return 1; } } class B : A { fn g() { return self.f(); } }", realOnly, /f is private to A; it cannot be used from B/);
passes(read("bank.orbs"), realOnly);
fails(read("err-abstract-new.orbs"), realOnly, /Shape is abstract/);
fails(read("err-missing-impl.orbs"), realOnly, /Circle does not implement name\/0/);
fails("class A { abstract fn f(); }", realOnly, /declares abstract fn f\/0 but is not an abstract class/);
fails("abstract class A { abstract fn f(); } class B : A { fn g() { return super.f(); } fn f() { return 1; } }", realOnly, /A.f is abstract/);
{
  const r = passes(read("shapes.orbs"), realOnly);
  assert.ok(r.trace.some((s) => s.explain.what === "Circle implements every abstract method it inherits."));
}
fails(read("err-overload.orbs"), realOnly, /fn add with 2 parameter\(s\) is already declared/);
{
  const r = passes(read("overload.orbs"), realOnly);
  const sem = r.output!;
  assert.deepEqual(sem.functions.map((f) => f.name).filter((n) => n.startsWith("add") || n.startsWith("Point.")),
    ["Point.init/0", "Point.init/2", "Point.show", "add/2", "add/3"], "name mangling only where a name is overloaded");
}
fails("fn add(a, b) { return a + b; } fn add(a, b, c) { return a; } print add(1);", realOnly, /no add takes 1 argument\(s\) \(there are versions with 2, 3\)/);
fails("class P { fn init(x) { } fn init(x, y) { } } let p = new P();", realOnly, /init takes 1 or 2 argument/);
passes("abstract class S { abstract fn a(); } class C : S { fn a() { return 1; } } class D : S { fn a() { return 2; } } let xs = [new C(), new D()];", realOnly);

console.log(`check-semantic: all assertions passed (${usedReal ? "real lex+parse" : "AST fixtures"})`);
