// Self-check for phase 6 (bytecode emission). Run: node scripts/check-bytecode.ts
// Uses hand-built IR fixtures (exported for check-vm.ts) so it never
// depends on the IR/optimizer phases being finished.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { assemble, OPCODE_NUM, hexBytes } from "../src/compiler/bytecode.ts";
import type { CodeObject, IrConst, IrInstr, IrProgram, Opcode } from "../src/compiler/irTypes.ts";
import type { TraceStep } from "../src/compiler/trace.ts";

// Mini IR assembler for fixtures: "OP [arg]" or "OP Ln" (jump), "Ln:" places
// label n, "@k" sets the source line for following instructions.
export function code(name: string, params: string[], slotNames: string[], consts: IrConst[], names: string[], src: string[]): CodeObject {
  const instrs: IrInstr[] = [];
  const labels: number[] = [];
  let line = 1;
  for (const s of src) {
    if (s.startsWith("@")) { line = Number(s.slice(1)); continue; }
    const lab = /^L(\d+):$/.exec(s);
    if (lab) { labels[Number(lab[1])] = instrs.length; continue; }
    const [op, a] = s.split(" ");
    if (a?.startsWith("L")) instrs.push({ op: op as Opcode, target: Number(a.slice(1)), line });
    else instrs.push({ op: op as Opcode, arg: a === undefined ? undefined : Number(a), line });
  }
  return { name, params, nslots: slotNames.length, slotNames, consts, names, instrs, labels };
}
const main = (slotNames: string[], consts: IrConst[], src: string[], names: string[] = []) =>
  code("<main>", [], slotNames, consts, names, [...src, "LOAD_CONST " + consts.indexOf(null), "RETURN_VALUE"]);

// BINARY_OP args: + 0, - 1, * 2, / 3.  COMPARE_OP args: == 0, != 1, < 2, > 3, <= 4, >= 5.
export const fixtures: Record<string, { ir: IrProgram; output?: string[]; error?: RegExp }> = {
  arithmetic: {
    // print (7 - -3) * 4 / 3; print 7 / -2;
    ir: { functions: [], main: main([], [7n, 3n, 4n, 2n, null], [
      "LOAD_CONST 0", "LOAD_CONST 1", "UNARY_NEGATIVE", "BINARY_OP 1", "LOAD_CONST 2", "BINARY_OP 2", "LOAD_CONST 1", "BINARY_OP 3", "PRINT",
      "@2", "LOAD_CONST 0", "LOAD_CONST 3", "UNARY_NEGATIVE", "BINARY_OP 3", "PRINT",
    ]) },
    output: ["13", "-3"],
  },
  ifElse: {
    // let x = 5; if (x > 3) print "big"; else print "small";
    ir: { functions: [], main: main(["x"], [5n, 3n, "big", "small", null], [
      "LOAD_CONST 0", "STORE_FAST 0",
      "@2", "LOAD_FAST 0", "LOAD_CONST 1", "COMPARE_OP 3", "POP_JUMP_IF_FALSE L0",
      "@3", "LOAD_CONST 2", "PRINT", "JUMP_FORWARD L1",
      "L0:", "@5", "LOAD_CONST 3", "PRINT", "L1:",
    ]) },
    output: ["big"],
  },
  whileLoop: {
    // let i = 0; let s = 0; while (i < 5) { s = s + i; i = i + 1; } print s;
    ir: { functions: [], main: main(["i", "s"], [0n, 5n, 1n, null], [
      "LOAD_CONST 0", "STORE_FAST 0", "@2", "LOAD_CONST 0", "STORE_FAST 1",
      "L0:", "@3", "LOAD_FAST 0", "LOAD_CONST 1", "COMPARE_OP 2", "POP_JUMP_IF_FALSE L1",
      "@4", "LOAD_FAST 1", "LOAD_FAST 0", "BINARY_OP 0", "STORE_FAST 1",
      "@5", "LOAD_FAST 0", "LOAD_CONST 2", "BINARY_OP 0", "STORE_FAST 0", "JUMP_BACKWARD L0",
      "L1:", "@7", "LOAD_FAST 1", "PRINT",
    ]) },
    output: ["10"],
  },
  factorial: {
    // fn fact(n) { if (n <= 1) { return 1; } return n * fact(n - 1); } print fact(20);
    ir: {
      functions: [code("fact", ["n"], ["n"], [1n], ["fact"], [
        "@2", "LOAD_FAST 0", "LOAD_CONST 0", "COMPARE_OP 4", "POP_JUMP_IF_FALSE L0", "LOAD_CONST 0", "RETURN_VALUE",
        "L0:", "@3", "LOAD_FAST 0", "LOAD_GLOBAL 0", "LOAD_FAST 0", "LOAD_CONST 0", "BINARY_OP 1", "CALL 1", "BINARY_OP 2", "RETURN_VALUE",
      ])],
      main: main([], [20n, null], ["@5", "LOAD_GLOBAL 0", "LOAD_CONST 0", "CALL 1", "PRINT"], ["fact"]),
    },
    output: ["2432902008176640000"],
  },
  arrays: {
    // let a = [1, 2, 3]; a[1] = 10; print a[1]; print a; print ["x", 1];
    ir: { functions: [], main: main(["a"], [1n, 2n, 3n, 10n, "x", null], [
      "LOAD_CONST 0", "LOAD_CONST 1", "LOAD_CONST 2", "BUILD_LIST 3", "STORE_FAST 0",
      "@2", "LOAD_CONST 3", "LOAD_FAST 0", "LOAD_CONST 0", "STORE_SUBSCR",
      "@3", "LOAD_FAST 0", "LOAD_CONST 0", "BINARY_SUBSCR", "PRINT",
      "@4", "LOAD_FAST 0", "PRINT",
      "@5", "LOAD_CONST 4", "LOAD_CONST 0", "BUILD_LIST 2", "PRINT",
    ]) },
    output: ["10", "[1, 10, 3]", '["x", 1]'],
  },
  strings: {
    // print "hi" + " there"; print "a" == "a";
    ir: { functions: [], main: main([], ["hi", " there", "a", null], [
      "LOAD_CONST 0", "LOAD_CONST 1", "BINARY_OP 0", "PRINT", "@2", "LOAD_CONST 2", "LOAD_CONST 2", "COMPARE_OP 0", "PRINT",
    ]) },
    output: ["hi there", "true"],
  },
  shortCircuit: {
    // print false && 1 / 0 == 1; print true || 1 / 0 == 1;  (the division never runs)
    ir: { functions: [], main: main([], [false, 1n, 0n, true, null], [
      "LOAD_CONST 0", "JUMP_IF_FALSE_OR_POP L0", "LOAD_CONST 1", "LOAD_CONST 2", "BINARY_OP 3", "LOAD_CONST 1", "COMPARE_OP 0", "L0:", "PRINT",
      "@2", "LOAD_CONST 3", "JUMP_IF_TRUE_OR_POP L1", "LOAD_CONST 1", "LOAD_CONST 2", "BINARY_OP 3", "LOAD_CONST 1", "COMPARE_OP 0", "L1:", "PRINT",
    ]) },
    output: ["false", "true"],
  },
  extendedArg: (() => {
    // 300 constants loaded inside a loop body: LOAD_CONST ≥ 256 needs one
    // EXTENDED_ARG, and the loop's jumps span > 255 units so they need one too.
    const consts: IrConst[] = Array.from({ length: 300 }, (_, k) => BigInt(k + 100));
    consts.push(0n, 2n, 1n, null); // 300: 0, 301: 2, 302: 1, 303: none
    const body = consts.slice(0, 300).flatMap((_, k) => [`LOAD_CONST ${k}`, "POP_TOP"]);
    return {
      ir: { functions: [], main: main(["i"], consts, [
        "LOAD_CONST 300", "STORE_FAST 0",
        "L0:", "LOAD_FAST 0", "LOAD_CONST 301", "COMPARE_OP 2", "POP_JUMP_IF_FALSE L1",
        ...body, "LOAD_FAST 0", "LOAD_CONST 302", "BINARY_OP 0", "STORE_FAST 0", "JUMP_BACKWARD L0",
        "L1:", "LOAD_FAST 0", "PRINT", "LOAD_CONST 299", "PRINT",
      ]) },
      output: ["2", "399"],
    };
  })(),
  divideByZero: {
    ir: { functions: [], main: main([], ["before", 1n, 0n, null], ["LOAD_CONST 0", "PRINT", "@2", "LOAD_CONST 1", "LOAD_CONST 2", "BINARY_OP 3", "PRINT"]) },
    error: /division by zero/,
  },
  infiniteLoop: {
    // while (true) { }
    ir: { functions: [], main: main([], [true, null], ["L0:", "LOAD_CONST 0", "POP_JUMP_IF_FALSE L1", "JUMP_BACKWARD L0", "L1:"]) },
    error: /halting problem/,
  },
  noValue: {
    // fn f() { } print f() + 1;
    ir: {
      functions: [code("f", [], [], [null], [], ["LOAD_CONST 0", "RETURN_VALUE"])],
      main: main([], [1n, null], ["@2", "LOAD_GLOBAL 0", "CALL 0", "LOAD_CONST 0", "BINARY_OP 0", "PRINT"], ["f"]),
    },
    error: /none used as an operand/,
  },
};

export function checkExplain(trace: TraceStep[], phase: string) {
  for (const [i, s] of trace.entries()) {
    for (const cell of ["what", "why", "formal", "next"] as const) {
      const t = s.explain[cell];
      assert.ok(t && t.trim(), `${phase} step ${i}: empty ${cell}`);
      assert.ok(t.length <= 170, `${phase} step ${i}: ${cell} too long (${t.length}): ${t}`);
    }
  }
}

function selfCheck() {
  for (const [name, fx] of Object.entries(fixtures)) {
    const r = assemble(fx.ir);
    assert.ok(r.ok && r.output, `${name}: assemble failed ${r.error?.message}`);
    checkExplain(r.trace, `bytecode/${name}`);
    const c = r.chapters;
    assert.equal(c[0].start, 0);
    assert.equal(c[c.length - 1].end, r.trace.length - 1);
    for (const obj of [r.output.main, ...r.output.functions]) {
      assert.equal(obj.code.length, obj.disasm.length * 2, `${name}: every disasm row is one 2-byte unit`);
    }
  }

  // The plan's example encoding: POP_JUMP_IF_FALSE L0 three units ahead → 2C 03.
  const ifElse = assemble(fixtures.ifElse.ir).output!.main;
  const pj = ifElse.disasm.find((d) => d.opname === "POP_JUMP_IF_FALSE")!;
  assert.equal(hexBytes(pj.bytes), "2C 03");
  assert.equal(pj.argrepr, `to ${pj.offset + 2 + 3 * 2} (L0)`);

  // Backward jump: offset = (i + 1) − target.
  const wl = assemble(fixtures.whileLoop.ir).output!.main;
  const jb = wl.disasm.find((d) => d.opname === "JUMP_BACKWARD")!;
  assert.equal(jb.arg, (jb.offset / 2 + 1) - 4);

  // EXTENDED_ARG path: prefixes present, sizing needed more than one pass.
  const ext = assemble(fixtures.extendedArg.ir);
  const m = ext.output!.main;
  assert.ok(m.code.includes(OPCODE_NUM.EXTENDED_ARG));
  const lc = m.disasm.find((d) => d.opname === "LOAD_CONST" && d.arg === 299)!;
  assert.deepEqual(m.disasm[m.disasm.indexOf(lc) - 1].bytes, [OPCODE_NUM.EXTENDED_ARG, 1]);
  assert.deepEqual(lc.bytes, [OPCODE_NUM.LOAD_CONST, 299 & 0xff]);
  assert.ok(ext.trace.filter((s) => s.action === "fixpoint").length >= 2, "jumps growing forces a second sizing pass");
  assert.ok(m.disasm.some((d, i) => d.opname === "POP_JUMP_IF_FALSE" && m.disasm[i - 1].opname === "EXTENDED_ARG"));

  // Broken IR → ok:false with an error step, never a throw.
  const bad = assemble({ functions: [], main: code("<main>", [], [], [], [], ["JUMP_FORWARD L5"]) });
  assert.equal(bad.ok, false);
  assert.equal(bad.trace[bad.trace.length - 1].action, "error");

  console.log(`check-bytecode: ${Object.keys(fixtures).length} fixtures OK`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) selfCheck();
