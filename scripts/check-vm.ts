// Self-check for phase 7 (the VM). Run: node scripts/check-vm.ts
// Runs the hand-built IR fixtures from check-bytecode.ts through assemble →
// run, then the real pipeline on src/samples/*.snek when every upstream
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
  const demo = sample("demo.snek");
  assert.equal(demo.errorPhase, undefined, `demo.snek failed in ${demo.errorPhase}`);
  checkExplain(demo.bytecode!.trace, "bytecode/demo");
  checkExplain(demo.vm!.trace, "vm/demo");
  assert.deepEqual(demo.vm!.output!.output, ["hi"]);
  const rt = sample("err-runtime.snek");
  assert.equal(rt.errorPhase, "vm");
  assert.match(rt.vm!.error!.message, /division by zero/);
  const hs = sample("err-halt.snek");
  assert.equal(hs.errorPhase, "vm");
  assert.match(hs.vm!.error!.message, /halting problem/);
  console.log("check-vm: real pipeline on samples OK");
} else {
  console.log("check-vm: upstream phases missing, skipped samples:", phases.filter((p) => !existsSync(p)).join(", "));
}
console.log(`check-vm: ${Object.keys(fixtures).length} fixtures OK`);
