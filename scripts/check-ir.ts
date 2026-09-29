// Self-check for IR generation: node scripts/check-ir.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lex } from "../src/compiler/lexer.ts";
import { parse } from "../src/compiler/parser.ts";
import { analyze } from "../src/compiler/semantic.ts";
import { generate } from "../src/compiler/irgen.ts";
import { formatInstr } from "../src/compiler/irTypes.ts";

const src = readFileSync(new URL("../src/samples/demo.orbs", import.meta.url), "utf8");
const ast = parse(lex(src).output!).output!.ast;
const sem = analyze(ast);
assert.ok(sem.ok, "demo passes semantics");
const r = generate(ast, sem.output!);
assert.ok(r.ok && r.output, "IR generated");
const prog = r.output;

for (const c of [prog.main, ...prog.functions]) {
  assert.equal(c.instrs.at(-1)!.op, "RETURN_VALUE", `${c.name} ends in RETURN_VALUE`);
  assert.ok(c.labels.every((p) => p >= 0 && p <= c.instrs.length), `${c.name}: every label placed`);
  assert.equal(new Set(c.consts).size, c.consts.length, `${c.name}: no duplicate consts`);
  for (const i of c.instrs) if (i.op.includes("JUMP")) assert.notEqual(i.target, undefined);
}
assert.deepEqual(prog.functions.map((f) => f.name), ["square"]);
assert.deepEqual(prog.functions[0].instrs.slice(0, 4).map((i) => formatInstr(i, prog.functions[0])),
  ["LOAD_FAST 0 (n)", "LOAD_FAST 0 (n)", "BINARY_OP 2 (*)", "RETURN_VALUE"]);
// `let limit = 1 + 2` → LOAD_CONST 1, LOAD_CONST 2, BINARY_OP +, STORE_FAST
const m = prog.main.instrs.map((i) => formatInstr(i, prog.main));
assert.deepEqual(m.slice(0, 4), ["LOAD_CONST 0 (1)", "LOAD_CONST 1 (2)", "BINARY_OP 0 (+)", "STORE_FAST 0 (limit)"]);

// Trace: for desugared, backpatching visible, no pending jump left, all cells filled.
assert.ok(r.trace.some((s) => s.action === "desugar"));
assert.ok(r.trace.some((s) => s.action === "emit" && s.instrs[s.emittedIndex!].pending));
assert.ok(r.trace.some((s) => s.action === "patch"));
assert.ok(r.trace.at(-1)!.instrs.every((i) => !i.pending));
for (const s of r.trace) for (const k of ["what", "why", "formal", "next"] as const) assert.ok(s.explain[k], `${s.action} has ${k}`);
assert.equal(r.chapters.length, ast.items.length + 1);
console.log(`check-ir OK — ${r.trace.length} steps, main ${prog.main.instrs.length} instrs`);
