// Self-check for phase 7 (the VM). Run: node scripts/check-vm.ts
// Runs the hand-built IR fixtures from check-bytecode.ts through assemble →
// run, then the real pipeline on src/samples/*.orbs when every upstream
// phase exists.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { assemble } from "../src/compiler/bytecode.ts";
import { run, STEP_CAP } from "../src/compiler/vm.ts";
import { checkExplain, fixtures } from "./check-bytecode.ts";

for (const [name, fx] of Object.entries(fixtures)) {
  const r = run(assemble(fx.ir).output!);
  checkExplain(r.trace, `vm/${name}`);
  if (fx.error) {
    assert.equal(r.ok, false, `${name}: expected a runtime error`);
    assert.match(r.error!.message, fx.error);
    assert.equal(r.trace[r.trace.length - 1].error, r.error!.message);
  } else {
    assert.ok(r.ok, `${name}: ${r.error?.message}`);
    assert.deepEqual(r.output!.output, fx.output, name);
  }
  const c = r.chapters;
  assert.equal(c[0].start, 0);
  assert.equal(c[c.length - 1].end, r.trace.length - 1);
}

// Output printed before the error survives; the step cap is exact.
const dz = run(assemble(fixtures.divideByZero.ir).output!);
assert.deepEqual(dz.trace[dz.trace.length - 1].output, ["before"]);
assert.deepEqual(dz.trace[dz.trace.length - 1].stack, ["1", "0"], "error step shows the operands still on the stack");
const halt = run(assemble(fixtures.infiniteLoop.ir).output!);
assert.equal(halt.trace.length, STEP_CAP + 1);

// Recursion: the frame stack really grows (fact(20) → 21 frames deep).
const fact = run(assemble(fixtures.factorial.ir).output!);
assert.equal(Math.max(...fact.trace.map((s) => s.frames.length)), 21);

// Real pipeline, once all phases exist.
const phases = ["lexer", "parser", "semantic", "irgen", "optimize"].map((f) => `src/compiler/${f}.ts`);
if (phases.every(existsSync)) {
  const { compile } = await import("../src/compiler/pipeline.ts");
  const sample = (f: string) => compile(readFileSync(`src/samples/${f}`, "utf8"));
  const demo = sample("demo.orbs");
  assert.equal(demo.errorPhase, undefined, `demo.orbs failed in ${demo.errorPhase}`);
  checkExplain(demo.bytecode!.trace, "bytecode/demo");
  checkExplain(demo.vm!.trace, "vm/demo");
  assert.deepEqual(demo.vm!.output!.output, ["hi"]);
  const rt = sample("err-runtime.orbs");
  assert.equal(rt.errorPhase, "vm");
  assert.match(rt.vm!.error!.message, /division by zero/);
  const hs = sample("err-halt.orbs");
  assert.equal(hs.errorPhase, "vm");
  assert.match(hs.vm!.error!.message, /halting problem/);
  // Every sample stops where its name says (err-*) or runs clean, and every
  // step of every phase it reached is fully explained.
  const { readdirSync } = await import("node:fs");
  const ERR_PHASE: Record<string, string> = {
    "err-lex": "lex", "err-parse": "parse", "err-semantic": "semantic", "err-redeclare": "semantic",
    "err-runtime": "vm", "err-halt": "vm", "err-recursion": "vm",
    "err-scale-write": "semantic", "err-bad-key": "vm",
    "err-cycle": "semantic", "err-no-field": "semantic", "err-self": "semantic",
    "err-private": "semantic", "err-abstract-new": "semantic", "err-missing-impl": "semantic", "err-overload": "semantic",
  };
  for (const f of readdirSync("src/samples").filter((f) => f.endsWith(".orbs"))) {
    const base = f.replace(/\.orbs$/, "");
    const r = sample(f);
    if (base.startsWith("err-")) assert.ok(base in ERR_PHASE, `${f}: add it to ERR_PHASE`);
    assert.equal(r.errorPhase, ERR_PHASE[base], `${f}: stopped in ${r.errorPhase}: ${r.errorPhase && (r as any)[r.errorPhase]?.error?.message}`);
    for (const ph of ["lex", "parse", "semantic", "ir", "opt", "bytecode", "vm"] as const) {
      const t = (r as any)[ph]?.trace;
      if (t) for (const [i, s] of t.entries()) for (const k of ["what", "why", "formal", "next"]) assert.ok(s.explain[k]?.trim(), `${f} ${ph} step ${i}: empty ${k}`);
    }
    if (r.bytecode) checkExplain(r.bytecode.trace, `bytecode/${f}`);
    if (r.vm) checkExplain(r.vm.trace, `vm/${f}`);
  }

  // M1: floats, %, none, built-ins, end to end.
  const out = (src: string) => {
    const r = compile(src);
    assert.equal(r.errorPhase, undefined, `${src}: failed in ${r.errorPhase}`);
    return r.vm!.output!.output;
  };
  assert.deepEqual(out("let pi = 3.14; let r = 2; print pi * r * r; print 17 % 5; print -7 % 3;"), ["12.56", "2", "-1"]);
  assert.deepEqual(out("print 7 / 2; print 7.0 / 2; print 1 == 1.0; print 1.5 < 2; print 2.0;"), ["3", "3.5", "true", "true", "2.0"]);
  assert.deepEqual(out("let n = none; print n; print n == none; n = 4; print n != none;"), ["none", "true", "true"]);
  assert.deepEqual(out("print len(\"hiss\"); print str(42) + \"!\"; print int(3.9); print int(\"-12\"); print float(3); print str([1.5, 2.0]);"),
    ["4", "42!", "3", "-12", "3.0", "[1.5, 2.0]"]);
  const vmErr = (src: string, re: RegExp) => {
    const r = compile(src);
    assert.equal(r.errorPhase, "vm", `${src}: expected a runtime error`);
    assert.match(r.vm!.error!.message, re);
    checkExplain(r.vm!.trace, `vm/${src}`);
  };
  vmErr("print int(\"abc\");", /not a number/);
  vmErr("print 1.5 / 0;", /division by zero/);
  vmErr("print 5 % 0;", /division by zero/);
  vmErr("fn f() { } print f() + 1;", /none used as an operand/);
  // M2: collections on the heap.
  assert.deepEqual(out("let xs = [3, 1]; xs.push(5); print xs.pop(); print xs; for x in xs { print x * 2; }"), ["5", "[3, 1]", "6", "2"]);
  assert.deepEqual(out("let d = @{\"a\": 1}; d[\"b\"] = 2; print d; print d.keys(); d.remove(\"a\"); print len(d);"), ["@{\"a\": 1, \"b\": 2}", "[\"a\", \"b\"]", "1"]);
  assert.deepEqual(out("fn id(x) { return x; } let c = @[1, 2]; c.add(id(1.0)); print c; print c.has(2);"), ["@[1, 2]", "true"], "1 and 1.0 are one key");
  assert.deepEqual(out("print @(1, @(2, 3)) == @(1, @(2, 3)); let a = [1]; print a == a; print a == [1];"), ["true", "true", "false"]);
  assert.deepEqual(out("fn first(c) { for v in c { return v; } return none; } print first([9, 8]); print first([]);"), ["9", "none"], "return inside for-each drops the iterator");
  assert.deepEqual(out("for ch in \"ab\" { print ch; } let g = @{@(0, 1): \"x\"}; print g[@(0, 1)];"), ["a", "b", "x"]);
  vmErr("let d = @{\"a\": 1}; print d[\"z\"];", /key "z" is not in the den/);
  vmErr("fn f(z) { return z.fly(); } print f([1]);", /coil has no method fly/);
  vmErr("let xs = [1]; xs.pop(); xs.pop();", /empty coil/);
  vmErr("fn f(k) { return @{k: 1}; } print f([1]);", /not hashable/);
  {
    const r = compile("let xs = [1, 2]; let d = @{\"k\": xs}; print d;");
    const last = r.vm!.trace.at(-1)!;
    assert.deepEqual(last.heap.map((h) => h.kind), ["coil", "den"], "heap lists reachable objects");
    const stored = r.vm!.trace.find((s) => s.opname === "STORE_FAST")!;
    assert.equal(stored.frames[0].locals[0].value, "coil #1", "locals hold a reference");
  }
  // M3: objects, construction frames, dynamic dispatch.
  {
    const zoo = sample("zoo.orbs");
    assert.deepEqual(zoo.vm!.output!.output, ["rex says ...", "(slithers) kaa says hiss", "0"]);
    const t = zoo.vm!.trace;
    assert.ok(t.some((s) => s.explain.what.includes("dynamic dispatch Snake.intro ✓")), "override found on the leaf");
    assert.ok(t.some((s) => s.explain.what.includes("Snake.speak ✓")), "self.speak() inside Animal.intro dispatches to Snake");
    assert.ok(t.some((s) => s.frames.map((f) => f.code).join(" ") === "<main> Animal.init Snake.<fields> Animal.<fields>"),
      "construction frames: root field initializer on top, the inherited init at the bottom");
    assert.ok(t.at(-1)!.heap.some((h) => h.kind === "Snake" && h.value.includes("legs: 0")));
  }
  assert.deepEqual(out("class Box { let items = []; } let a = new Box(); let b = new Box(); a.items.push(1); print b.items; print a;"),
    ["[]", "Box{items: [1]}"], "field initializers run per object");
  assert.deepEqual(out("class P { let x; fn init(x) { self.x = x; } } class Q : P { } print new Q(3).x;"), ["3"], "init is inherited");
  vmErr("fn f(o) { return o.nope; } class A { } print f(new A());", /A has no field nope/);
  vmErr("fn f(o) { return o.m(); } class A { } print f(new A());", /A has no method m/);
  vmErr("class A { fn f() { } } fn g(o) { return o.f; } print g(new A());", /f is a method/);
  // M4: encapsulation re-checked at run time, abstract dispatch, overloads.
  assert.deepEqual(sample("bank.orbs").vm!.output!.output, ["deposit -> 50", "refused", "withdraw -> 30", "30"]);
  assert.deepEqual(sample("shapes.orbs").vm!.output!.output, ["area 3.14", "area 9"]);
  assert.deepEqual(sample("overload.orbs").vm!.output!.output, ["3", "6", "(0, 0)", "(3, 4)"]);
  vmErr("class A { priv let s = 1; } fn peek(o) { return o.s; } print peek(new A());", /s is private to A/);
  vmErr("class A { priv fn f() { return 1; } } fn call(o) { return o.f(); } print call(new A());", /f is private to A/);
  vmErr("class A { fn f(x) { return x; } } fn call(o) { return o.f(); } print call(new A());", /no A.f takes 0 argument/);
  const folded = compile("print 1.5 * 2; print 7 % 3; print -2.5;").opt!.output!.program.main;
  const consts = folded.consts.map(String);
  assert.ok(consts.includes("3") && consts.includes("1") && consts.includes("-2.5"), `float/% folded: ${consts}`);
  console.log("check-vm: real pipeline on samples OK");
} else {
  console.log("check-vm: upstream phases missing, skipped samples:", phases.filter((p) => !existsSync(p)).join(", "));
}
console.log(`check-vm: ${Object.keys(fixtures).length} fixtures OK`);
