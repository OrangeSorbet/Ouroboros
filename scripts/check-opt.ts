// Self-check for the CFG optimizer: node scripts/check-opt.ts
// Runs a tiny IR interpreter on the program before and after optimization
// to show the rewrites preserve behaviour.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lex } from "../src/compiler/lexer.ts";
import { parse } from "../src/compiler/parser.ts";
import { analyze } from "../src/compiler/semantic.ts";
import { generate } from "../src/compiler/irgen.ts";
import { optimize } from "../src/compiler/optimize.ts";
import { BINARY_OPS, COMPARE_OPS, formatInstr } from "../src/compiler/irTypes.ts";
import type { CodeObject, IrProgram } from "../src/compiler/irTypes.ts";

function irOf(file: string): IrProgram {
  const src = readFileSync(new URL(`../src/samples/${file}`, import.meta.url), "utf8");
  const ast = parse(lex(src).output!).output!.ast;
  return generate(ast, analyze(ast).output!).output!;
}

function exec(p: IrProgram): string[] {
  const out: string[] = [];
  const call = (c: CodeObject, args: any[]): any => {
    const loc: any[] = [...args];
    const st: any[] = [];
    let pc = 0;
    const jump = (i: typeof c.instrs[number]) => { pc = c.labels[i.target!]; };
    for (let steps = 0; steps < 1e5; steps++) {
      const i = c.instrs[pc++];
      switch (i.op) {
        case "LOAD_CONST": st.push(c.consts[i.arg!]); break;
        case "LOAD_FAST": st.push(loc[i.arg!]); break;
        case "STORE_FAST": loc[i.arg!] = st.pop(); break;
        case "LOAD_GLOBAL": st.push(p.functions.find((f) => f.name === c.names[i.arg!])); break;
        case "BINARY_OP": case "COMPARE_OP": {
          const b = st.pop(), a = st.pop(), o = (i.op === "BINARY_OP" ? BINARY_OPS : COMPARE_OPS)[i.arg!];
          if (o === "/" && b === 0n) throw new Error("division by zero");
          st.push(({ "+": a + b, "-": a - b, "*": a * b, "/": o === "/" ? a / b : 0, "==": a === b, "!=": a !== b, "<": a < b, ">": a > b, "<=": a <= b, ">=": a >= b } as any)[o]);
          break;
        }
        case "UNARY_NEGATIVE": st.push(-st.pop()); break;
        case "UNARY_NOT": st.push(!st.pop()); break;
        case "BUILD_LIST": st.push(st.splice(st.length - i.arg!, i.arg!)); break;
        case "BINARY_SUBSCR": { const x = st.pop(); st.push(st.pop()[Number(x)]); break; }
        case "STORE_SUBSCR": { const x = st.pop(), a = st.pop(); a[Number(x)] = st.pop(); break; }
        case "CALL": { const a = st.splice(st.length - i.arg!, i.arg!); st.push(call(st.pop(), a)); break; }
        case "RETURN_VALUE": return st.pop();
        case "PRINT": out.push(String(st.pop())); break;
        case "POP_TOP": st.pop(); break;
        case "JUMP_FORWARD": case "JUMP_BACKWARD": jump(i); break;
        case "POP_JUMP_IF_FALSE": if (!st.pop()) jump(i); break;
        case "JUMP_IF_FALSE_OR_POP": if (!st.at(-1)) jump(i); else st.pop(); break;
        case "JUMP_IF_TRUE_OR_POP": if (st.at(-1)) jump(i); else st.pop(); break;
      }
    }
    throw new Error("step cap");
  };
  call(p.main, []);
  return out;
}

const ir = irOf("demo.orbs");
const r = optimize(ir);
assert.ok(r.ok && r.output);
const opt = r.output.program;
const text = (c: CodeObject) => c.instrs.map((i) => formatInstr(i, c));

assert.deepEqual(exec(ir), ["hi"], "demo prints hi before optimization");
assert.deepEqual(exec(opt), ["hi"], "demo prints hi after optimization");
assert.deepEqual(exec(r.output.before), ["hi"], "before snapshot untouched");

const m = text(opt.main);
assert.match(m[0], /^LOAD_CONST \d+ \(3\)$/, "1 + 2 folded to 3");
assert.equal(m[1], "STORE_FAST 0 (limit)");
assert.ok(!m.some((t) => t.includes('"never"')), "if (false) block removed");
assert.ok(!m.some((t) => t.includes("(false)")), "if (false) test removed");
assert.ok(opt.main.instrs.length < ir.main.instrs.length);
assert.equal(opt.functions[0].instrs.length, 4, "dead implicit return after `return n*n` removed");
for (const a of ["leaders", "blocks", "edges", "fold", "branch-fold", "dce", "peephole", "fixpoint"])
  assert.ok(r.trace.some((s) => s.action === a), `trace has ${a}`);
for (const s of r.trace) for (const k of ["what", "why", "formal", "next"] as const) assert.ok(s.explain[k]);

// Division by zero must survive optimization (it is a run-time error).
const rt = optimize(irOf("err-runtime.orbs"));
assert.ok(text(rt.output!.program.main).some((t) => t.includes("(/)")), "1 / 0 not folded");
assert.ok(rt.trace.some((s) => s.explain.what.startsWith("Did not fold")));
assert.throws(() => exec(rt.output!.program), /division by zero/);
console.log(`check-opt OK — ${r.trace.length} steps, main ${ir.main.instrs.length} → ${opt.main.instrs.length} instrs`);
