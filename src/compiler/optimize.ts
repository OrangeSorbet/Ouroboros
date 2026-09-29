// Phase 5 — Control-Flow Graph + Optimize (docs/phase34plan.md §12).
// Per code object: find leaders → cut basic blocks → add edges (each shown as
// its own step), then run the rewrite rules to a fixpoint. Every rewrite is
// one trace step carrying the CFG it fired on plus a before/after diff.
//
// Rewrites keep labels consistent by re-pointing each label at the first
// surviving instruction at/after its old position. Constants that become
// unused stay in the pool (indices never shift, so no renumbering is needed).
import { JUMP_OPS, formatConst, formatInstr } from "./irTypes.ts";
import type { CodeObject, IrConst, IrInstr, IrProgram, Opcode } from "./irTypes.ts";
import type { Chapter, Explanation, PhaseResult, TraceStep } from "./trace.ts";
import { optMessages } from "./messages/opt.ts";
import { arith, compare, isNum } from "./values.ts";

export type OptAction =
  | "leaders" | "blocks" | "edges"
  | "propagate" | "fold" | "branch-fold" | "dce" | "peephole" | "fixpoint";

export type EdgeKind = "fall" | "jump" | "true" | "false" | "next" | "done";

export interface CfgBlock {
  id: number;
  start: number; // first instruction index
  end: number;   // last instruction index (inclusive)
  instrs: string[];
}

export interface CfgEdge {
  from: number;
  to: number;
  kind: EdgeKind;
  back: boolean; // target block starts at/before the source block — a loop back-edge
}

export interface DiffRow {
  text: string;
  kind: "same" | "removed" | "added";
  block: number; // block id in this step's `blocks`
}

export interface OptStep extends TraceStep {
  action: OptAction;
  code: string;          // code object name
  codeRef: CodeObject;   // working copy (consts only grow, so formatting old snapshots stays valid)
  blocks: CfgBlock[];    // the CFG this step concerns (for rewrites: the graph the rule fired on)
  edges: CfgEdge[];
  leaders?: number[];
  activeBlock?: number;
  deadBlocks?: number[]; // dce: blocks about to be deleted
  removed?: number[];    // instruction indices (before) removed or replaced
  added?: number[];      // instruction indices (after) newly written
  rows: DiffRow[];       // IR listing for the panel, with the diff folded in
  instrsAfter: IrInstr[];
}

export interface OptOutput {
  program: IrProgram;
  before: IrProgram;
}

interface Cfg {
  leaders: number[];
  blocks: { id: number; start: number; end: number }[];
  blockOf: number[];
  edges: CfgEdge[];
}

interface Rewrite {
  action: OptAction;
  remove: number[];
  replace: Map<number, IrInstr>;
  explain: Omit<Explanation, "next">;
  summary: string;
  at: number; // an instruction index inside the block the rule fired in
  deadBlocks?: number[];
}

const UNCOND: ReadonlySet<Opcode> = new Set<Opcode>(["JUMP_FORWARD", "JUMP_BACKWARD"]);
// ponytail: hard cap on rewrites per code object; the rules provably
// terminate (see the fixpoint explanation), this only guards against a bug.
const MAX_REWRITES = 1000;

function cloneCode(c: CodeObject): CodeObject {
  return {
    ...c, params: [...c.params], slotNames: [...c.slotNames], consts: [...c.consts], names: [...c.names],
    instrs: c.instrs.map((i) => ({ ...i })), labels: [...c.labels],
  };
}

function cloneProgram(p: IrProgram): IrProgram {
  return { main: cloneCode(p.main), functions: p.functions.map(cloneCode), classes: p.classes };
}

export function buildCfg(code: CodeObject): Cfg {
  const ins = code.instrs;
  const n = ins.length;
  const lead = new Set<number>(n ? [0] : []);
  ins.forEach((x, i) => {
    if (x.target !== undefined && code.labels[x.target] < n) lead.add(code.labels[x.target]);
    if ((JUMP_OPS.has(x.op) || x.op === "RETURN_VALUE") && i + 1 < n) lead.add(i + 1);
  });
  const leaders = [...lead].sort((a, b) => a - b);
  const blocks = leaders.map((start, id) => ({ id, start, end: (leaders[id + 1] ?? n) - 1 }));
  const blockOf: number[] = [];
  for (const b of blocks) for (let i = b.start; i <= b.end; i++) blockOf[i] = b.id;

  const edges: CfgEdge[] = [];
  for (const b of blocks) {
    const last = ins[b.end];
    const add = (to: number | undefined, kind: EdgeKind) => {
      if (to !== undefined) edges.push({ from: b.id, to, kind, back: blocks[to].start <= b.start });
    };
    const tgt = last.target !== undefined ? blockOf[code.labels[last.target]] : undefined;
    const next = b.id + 1 < blocks.length ? b.id + 1 : undefined;
    switch (last.op) {
      case "RETURN_VALUE": break;
      case "JUMP_FORWARD":
      case "JUMP_BACKWARD": add(tgt, "jump"); break;
      case "POP_JUMP_IF_FALSE":
      case "JUMP_IF_FALSE_OR_POP": add(tgt, "false"); add(next, "true"); break;
      case "JUMP_IF_TRUE_OR_POP": add(tgt, "true"); add(next, "false"); break;
      case "FOR_ITER": add(tgt, "done"); add(next, "next"); break;
      default: add(next, "fall");
    }
  }
  return { leaders, blocks, blockOf, edges };
}

// ---- constant evaluation (mirrors the VM's semantics exactly) ----

type Folded = { value: IrConst } | "div0" | null;

// A type error is left for the VM to report at run time (null); a zero
// divisor is refused explicitly ("div0") so the error stays in the program.
function evalBinary(op: Opcode, sym: string, a: IrConst, b: IrConst): Folded {
  const r = op === "COMPARE_OP" ? compare(sym, a, b) : arith(sym, a, b);
  if ("error" in r) return r.error === "division" ? "div0" : null;
  return { value: r.value };
}

const BIN_SYMS = ["+", "-", "*", "/", "%"];
const CMP_SYMS = ["==", "!=", "<", ">", "<=", ">="];

class Optimizer {
  steps: OptStep[] = [];
  summaries: string[] = [];
  chapters: Chapter[] = [];

  intern(code: CodeObject, c: IrConst): number {
    let i = code.consts.findIndex((k) => k === c);
    if (i < 0) i = code.consts.push(c) - 1;
    return i;
  }

  constAt(code: CodeObject, i: number): { v: IrConst } | null {
    const x = code.instrs[i];
    return x && x.op === "LOAD_CONST" ? { v: code.consts[x.arg!] } : null;
  }

  blocksOf(code: CodeObject, cfg: Cfg, upTo = cfg.blocks.length): CfgBlock[] {
    return cfg.blocks.slice(0, upTo).map((b) => ({
      ...b, instrs: code.instrs.slice(b.start, b.end + 1).map((x) => formatInstr(x, code)),
    }));
  }

  plainRows(code: CodeObject, cfg: Cfg): DiffRow[] {
    return code.instrs.map((x, i) => ({ text: formatInstr(x, code), kind: "same", block: cfg.blockOf[i] }));
  }

  push(s: Omit<OptStep, "explain" | "instrsAfter"> & { instrsAfter?: IrInstr[] }, ex: Omit<Explanation, "next">, summary: string) {
    this.steps.push({ instrsAfter: s.codeRef.instrs.map((x) => ({ ...x })), ...s, explain: { ...ex, next: "" } });
    this.summaries.push(summary);
  }

  // ---- rules: each returns the first applicable rewrite, or null ----

  propagate(code: CodeObject, cfg: Cfg): Rewrite | null {
    const ins = code.instrs;
    for (const b of cfg.blocks) {
      const known = new Map<number, number>(); // slot → const index
      for (let i = b.start; i <= b.end; i++) {
        const x = ins[i];
        if (x.op === "STORE_FAST") {
          if (i > b.start && ins[i - 1].op === "LOAD_CONST") known.set(x.arg!, ins[i - 1].arg!);
          else known.delete(x.arg!);
        } else if (x.op === "LOAD_FAST" && known.has(x.arg!)) {
          const k = known.get(x.arg!)!;
          const c = formatConst(code.consts[k]);
          const name = code.slotNames[x.arg!] ?? `slot ${x.arg}`;
          return {
            action: "propagate", remove: [], replace: new Map([[i, { ...x, op: "LOAD_CONST", arg: k }]]),
            explain: optMessages.propagate(name, c, b.id), summary: `propagate ${name} = ${c}`, at: i,
          };
        }
      }
    }
    return null;
  }

  fold(code: CodeObject, cfg: Cfg, refused: Set<string>): Rewrite | null {
    const ins = code.instrs;
    for (let i = 0; i < ins.length; i++) {
      const a = this.constAt(code, i);
      if (!a) continue;
      const u = ins[i + 1];
      if (u && cfg.blockOf[i + 1] === cfg.blockOf[i] && (u.op === "UNARY_NEGATIVE" || u.op === "UNARY_NOT")) {
        const ok = u.op === "UNARY_NEGATIVE" ? isNum(a.v) : typeof a.v === "boolean";
        if (ok) {
          const r: IrConst = u.op === "UNARY_NEGATIVE" ? -(a.v as bigint | number) : !a.v;
          const expr = `${u.op === "UNARY_NEGATIVE" ? "-" : "!"}${formatConst(a.v)}`;
          return this.foldRewrite(code, i, [i + 1], r, expr, false);
        }
      }
      const b = this.constAt(code, i + 1);
      const o = ins[i + 2];
      if (!b || !o || (o.op !== "BINARY_OP" && o.op !== "COMPARE_OP")) continue;
      if (cfg.blockOf[i + 2] !== cfg.blockOf[i]) continue;
      const sym = (o.op === "BINARY_OP" ? BIN_SYMS : CMP_SYMS)[o.arg!];
      const expr = `${formatConst(a.v)} ${sym} ${formatConst(b.v)}`;
      const res = evalBinary(o.op, sym, a.v, b.v);
      if (res === "div0") {
        // Report the refusal once per source expression, not every round.
        const key = `${o.astId ?? i}`;
        if (refused.has(key)) continue;
        refused.add(key);
        return { action: "fold", remove: [], replace: new Map(), explain: optMessages.foldRefused(expr), summary: `refuse to fold ${expr}`, at: i };
      }
      if (res) return this.foldRewrite(code, i, [i + 1, i + 2], res.value, expr, (sym === "/" || sym === "%") && typeof res.value === "bigint");
    }
    return null;
  }

  foldRewrite(code: CodeObject, i: number, remove: number[], value: IrConst, expr: string, div: boolean): Rewrite {
    const k = this.intern(code, value);
    const last = code.instrs[remove[remove.length - 1]];
    return {
      action: "fold", remove,
      replace: new Map([[i, { op: "LOAD_CONST", arg: k, line: last.line, astId: last.astId }]]),
      explain: optMessages.fold(expr, formatConst(value), div), summary: `fold ${expr} → ${formatConst(value)}`, at: i,
    };
  }

  branchFold(code: CodeObject, cfg: Cfg): Rewrite | null {
    const ins = code.instrs;
    for (let i = 0; i + 1 < ins.length; i++) {
      const c = this.constAt(code, i);
      const j = ins[i + 1];
      if (!c || typeof c.v !== "boolean" || cfg.blockOf[i + 1] !== cfg.blockOf[i]) continue;
      let jumps: boolean;
      if (j.op === "POP_JUMP_IF_FALSE" || j.op === "JUMP_IF_FALSE_OR_POP") jumps = !c.v;
      else if (j.op === "JUMP_IF_TRUE_OR_POP") jumps = c.v;
      else continue;
      const explain = optMessages.branchFold(c.v, j.op, jumps, j.target!);
      if (!jumps) return { action: "branch-fold", remove: [i, i + 1], replace: new Map(), explain, summary: `drop never-taken ${j.op}`, at: i };
      // POP_JUMP pops the condition, so its LOAD_CONST goes too; the _OR_POP
      // forms keep the value on the stack when they jump, so it stays.
      const remove = j.op === "POP_JUMP_IF_FALSE" ? [i] : [];
      return {
        action: "branch-fold", remove, replace: new Map([[i + 1, { ...j, op: "JUMP_FORWARD" }]]),
        explain, summary: `${j.op} → JUMP_FORWARD`, at: i,
      };
    }
    return null;
  }

  dce(cfg: Cfg): Rewrite | null {
    if (!cfg.blocks.length) return null;
    const seen = new Set<number>([0]);
    const queue = [0];
    while (queue.length) {
      const b = queue.shift()!;
      for (const e of cfg.edges) if (e.from === b && !seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
    }
    const dead = cfg.blocks.filter((b) => !seen.has(b.id));
    if (!dead.length) return null;
    const remove = dead.flatMap((b) => Array.from({ length: b.end - b.start + 1 }, (_, k) => b.start + k));
    const ids = dead.map((b) => b.id);
    return {
      action: "dce", remove, replace: new Map(), explain: optMessages.dce(ids, remove.length),
      summary: `remove unreachable B${ids.join(", B")}`, at: dead[0].start, deadBlocks: ids,
    };
  }

  peephole(code: CodeObject, cfg: Cfg): Rewrite | null {
    const ins = code.instrs;
    const pos = (l: number) => code.labels[l];
    for (let i = 0; i < ins.length; i++) {
      const x = ins[i];
      if (x.op === "LOAD_CONST" && ins[i + 1]?.op === "POP_TOP" && cfg.blockOf[i + 1] === cfg.blockOf[i]) {
        const c = formatConst(code.consts[x.arg!]);
        return { action: "peephole", remove: [i, i + 1], replace: new Map(), explain: optMessages.popConst(c), summary: `drop LOAD_CONST ${c} · POP_TOP`, at: i };
      }
      if (x.target === undefined) continue;
      if (UNCOND.has(x.op) && pos(x.target) === i + 1) {
        return { action: "peephole", remove: [i], replace: new Map(), explain: optMessages.jumpNext(x.op, x.target), summary: `drop ${x.op} to next`, at: i };
      }
      // Follow a chain of unconditional jumps to its end; give up on a cycle
      // (e.g. an emptied `while (true) {}`), where there is no end to reach.
      const p = pos(x.target);
      if (p >= ins.length || !UNCOND.has(ins[p].op)) continue;
      const visited = new Set<number>(UNCOND.has(x.op) ? [i, p] : [p]);
      let label = ins[p].target!;
      let cyclic = false;
      for (;;) {
        const q = pos(label);
        if (q >= ins.length || !UNCOND.has(ins[q].op)) break;
        if (visited.has(q)) { cyclic = true; break; }
        visited.add(q);
        label = ins[q].target!;
      }
      const dest = pos(label);
      if (cyclic || label === x.target || dest === p) continue;
      let op = x.op;
      if (UNCOND.has(x.op)) op = dest > i ? "JUMP_FORWARD" : "JUMP_BACKWARD";
      else if (dest <= i) continue; // conditional jumps are forward-only (irTypes contract)
      return {
        action: "peephole", remove: [], replace: new Map([[i, { ...x, op, target: label }]]),
        explain: optMessages.thread(x.op, x.target, label), summary: `thread ${x.op} → L${label}`, at: i,
      };
    }
    return null;
  }

  // ---- apply a rewrite: rebuild instrs, re-point labels, record the step ----

  apply(code: CodeObject, cfg: Cfg, rw: Rewrite, name: string): boolean {
    const gone = new Set(rw.remove);
    const before = code.instrs;
    const shift = (p: number) => p - rw.remove.filter((r) => r < p).length;
    const rows: DiffRow[] = [];
    const after: IrInstr[] = [];
    const added: number[] = [];
    before.forEach((x, i) => {
      const block = cfg.blockOf[i];
      const rep = rw.replace.get(i);
      const text = formatInstr(x, code);
      if (gone.has(i)) { rows.push({ text, kind: "removed", block }); return; }
      if (rep) {
        rows.push({ text, kind: "removed", block });
        rows.push({ text: formatInstr(rep, code), kind: "added", block });
        added.push(after.length);
        after.push(rep);
      } else {
        rows.push({ text, kind: "same", block });
        after.push(x);
      }
    });
    const changed = gone.size > 0 || rw.replace.size > 0;
    this.push({
      action: rw.action, code: name, codeRef: code, blocks: this.blocksOf(code, cfg), edges: cfg.edges,
      activeBlock: cfg.blockOf[rw.at], deadBlocks: rw.deadBlocks,
      removed: [...rw.remove, ...rw.replace.keys()].sort((a, b) => a - b), added, rows,
      instrsAfter: after.map((x) => ({ ...x })),
    }, rw.explain, rw.summary);
    code.instrs = after;
    code.labels = code.labels.map(shift);
    return changed;
  }

  run(code: CodeObject, first: boolean) {
    const name = code.name === "<main>" ? "<main>" : `fn ${code.name}`;
    let cfg = buildCfg(code);

    let start = this.steps.length;
    this.push({ action: "leaders", code: name, codeRef: code, blocks: [], edges: [], leaders: cfg.leaders, rows: this.plainRows(code, cfg) },
      optMessages.leaders(name, cfg.leaders, first), `find leaders of ${name}`);
    const full = this.blocksOf(code, cfg);
    cfg.blocks.forEach((b, k) => {
      this.push({ action: "blocks", code: name, codeRef: code, blocks: full.slice(0, k + 1), edges: [], activeBlock: b.id, rows: this.plainRows(code, cfg) },
        optMessages.block(b.id, b.start, b.end), `cut block B${b.id}`);
    });
    cfg.blocks.forEach((b) => {
      const out = cfg.edges.filter((e) => e.from === b.id);
      const desc = out.map((e) => `B${e.to} (${e.kind})`).join(", ");
      this.push({ action: "edges", code: name, codeRef: code, blocks: full, edges: cfg.edges.filter((e) => e.from <= b.id), activeBlock: b.id, rows: this.plainRows(code, cfg) },
        optMessages.edges(b.id, desc, code.instrs[b.end].op), `edges out of B${b.id}`);
    });
    this.chapters.push({ start, end: this.steps.length - 1, label: `CFG ${name}` });

    start = this.steps.length;
    const sizeBefore = code.instrs.length;
    const refused = new Set<string>();
    let rounds = 0;
    let budget = MAX_REWRITES;
    let changed = true;
    while (changed && budget > 0) {
      changed = false;
      rounds++;
      const rules = [
        () => this.propagate(code, cfg), () => this.fold(code, cfg, refused), () => this.branchFold(code, cfg),
        () => this.dce(cfg), () => this.peephole(code, cfg),
      ];
      for (const rule of rules) {
        let rw: Rewrite | null;
        while (budget-- > 0 && (rw = rule())) {
          if (this.apply(code, cfg, rw, name)) changed = true;
          cfg = buildCfg(code);
        }
      }
    }
    this.push({ action: "fixpoint", code: name, codeRef: code, blocks: this.blocksOf(code, cfg), edges: cfg.edges, rows: this.plainRows(code, cfg) },
      optMessages.fixpoint(name, rounds, sizeBefore, code.instrs.length), `${name} optimized`);
    this.chapters.push({ start, end: this.steps.length - 1, label: `optimize ${name}` });
  }
}

export function optimize(ir: IrProgram): PhaseResult<OptStep, OptOutput> {
  const before = cloneProgram(ir);
  const program = cloneProgram(ir);
  const o = new Optimizer();
  // <main> first: it holds the headline rewrites (folding, dead `if`).
  [program.main, ...program.functions].forEach((c, i) => o.run(c, i === 0));
  o.steps.forEach((s, i) => {
    s.explain.next = i + 1 < o.steps.length ? optMessages.next(o.summaries[i + 1]) : optMessages.done;
  });
  return { ok: true, trace: o.steps, chapters: o.chapters, output: { program, before } };
}
