// Phase 4 — AST → Instructions. A syntax-directed translation: one rule per
// AST node kind (messages/ir.ts IR_RULES), applied in a post-order walk so a
// node's instructions follow its children's — exactly what a stack machine
// needs (operands pushed before the operator pops them).
//
// Forward jumps are emitted before their label exists; the trace shows them
// as pending ("?") until the label is placed and the jump is backpatched.
//
// Trace order: top-level items in source order. A FuncDecl opens its own code
// object where it appears, so the code panel follows the text top to bottom;
// the emitted IR is the same as if functions were translated separately.
import type * as A from "./ast.ts";
import type { SemanticInfo, CodeScopeInfo } from "./semanticTypes.ts";
import { BINARY_OPS, COMPARE_OPS, formatInstr } from "./irTypes.ts";
import { BUILTINS } from "./values.ts";
import type { CodeObject, IrConst, IrInstr, IrProgram, Opcode } from "./irTypes.ts";
import type { Chapter, Explanation, PhaseResult, TraceStep } from "./trace.ts";
import { IR_RULES, irMessages } from "./messages/ir.ts";

export type IrGenAction = "begin-code" | "desugar" | "enter" | "emit" | "label" | "patch" | "error";

// Snapshot instruction: a forward jump whose label is not placed yet has
// `target` undefined and `pending` true.
export interface IrGenInstr extends IrInstr {
  pending?: boolean;
}

export interface IrGenStep extends TraceStep {
  action: IrGenAction;
  code: string;          // code object being written ("<main>" or fn name)
  codeRef: CodeObject;   // that code object (final state — consts/names only grow, so indices in snapshots stay valid)
  item: number;          // index into ast.items of the top-level item being translated
  nodeId?: number;
  instrs: IrGenInstr[];  // snapshot of codeRef.instrs after this step
  emittedIndex?: number; // emit: index of the new instruction
  patched?: number[];    // patch: instruction indices whose target was filled
  label?: number;        // label / patch: label id placed
  finished: number[];    // AST node ids whose translation completed at this step
  tree?: A.Block;        // desugar: the rewritten form of the ForStmt (synthetic nodes have negative ids)
}

function newCode(info: CodeScopeInfo): CodeObject {
  return {
    name: info.name, params: [...info.params], nslots: info.nslots, slotNames: [...info.slotNames],
    consts: [], names: [], instrs: [], labels: [],
  };
}

class Generator {
  steps: IrGenStep[] = [];
  summaries: string[] = [];
  program: IrProgram;
  cur: CodeObject;
  pending = new Map<CodeObject, Set<number>>();
  item = 0;
  nextSynthId = -1;
  sem: SemanticInfo;

  constructor(sem: SemanticInfo) {
    this.sem = sem;
    this.program = { main: newCode(sem.main), functions: sem.functions.map(newCode), classes: sem.classes };
    this.cur = this.program.main;
    this.pending.set(this.cur, new Set());
    for (const f of this.program.functions) this.pending.set(f, new Set());
  }

  get pend(): Set<number> {
    return this.pending.get(this.cur)!;
  }

  snapshot(): IrGenInstr[] {
    const p = this.pend;
    return this.cur.instrs.map((ins, i) => (p.has(i) ? { ...ins, target: undefined, pending: true } : { ...ins }));
  }

  text(i: number): string {
    const ins = this.cur.instrs[i];
    return this.pend.has(i) ? `${ins.op} ?` : formatInstr(ins, this.cur);
  }

  step(action: IrGenAction, node: A.AstNode | null, ex: Omit<Explanation, "next">, summary: string, extra: Partial<IrGenStep> = {}) {
    this.steps.push({
      action, code: this.cur.name, codeRef: this.cur, item: this.item,
      nodeId: node?.id, span: node?.span, instrs: this.snapshot(), finished: [],
      explain: { ...ex, next: "" }, ...extra,
    });
    this.summaries.push(summary);
  }

  finish(node: A.AstNode) {
    this.steps[this.steps.length - 1]?.finished.push(node.id);
  }

  constIndex(c: IrConst): number {
    // === is exact for bigint/bool/string/null and never equates 1n with "1".
    let i = this.cur.consts.findIndex((k) => k === c);
    if (i < 0) i = this.cur.consts.push(c) - 1;
    return i;
  }

  nameIndex(n: string): number {
    let i = this.cur.names.indexOf(n);
    if (i < 0) i = this.cur.names.push(n) - 1;
    return i;
  }

  emit(op: Opcode, node: A.AstNode, rule: string, opts: { arg?: number; target?: number; pending?: boolean; why?: Omit<Explanation, "next"> } = {}): number {
    const ins: IrInstr = { op, line: node.span.line, astId: node.id };
    if (opts.arg !== undefined) ins.arg = opts.arg;
    if (opts.target !== undefined) ins.target = opts.target;
    const idx = this.cur.instrs.push(ins) - 1;
    if (opts.pending) this.pend.add(idx);
    const text = this.text(idx);
    this.step("emit", node, opts.why ?? irMessages.emit(text, node.kind, op, rule, !!opts.pending), `emit ${text}`, { emittedIndex: idx });
    return idx;
  }

  newLabel(): number {
    return this.cur.labels.push(-1) - 1;
  }

  place(label: number, node: A.AstNode, jumpIdx?: number) {
    const at = this.cur.instrs.length;
    this.cur.labels[label] = at;
    if (jumpIdx === undefined) {
      this.step("label", node, irMessages.label(label, at), `place L${label}`, { label });
    } else {
      this.pend.delete(jumpIdx);
      const op = this.cur.instrs[jumpIdx].op;
      this.step("patch", node, irMessages.patch(label, at, jumpIdx, op), `backpatch #${jumpIdx} → L${label}`, { label, patched: [jumpIdx] });
    }
  }

  enter(node: A.AstNode, label: string, rule: string) {
    this.step("enter", node, irMessages.enter(node.kind, label, rule), `enter ${node.kind}${label ? ` ${label}` : ""}`);
  }

  returnNone(node: A.AstNode, rule: string, implicit: boolean) {
    const why = implicit ? irMessages.implicitReturn(this.cur.name, rule) : undefined;
    this.emit("LOAD_CONST", node, rule, { arg: this.constIndex(null), why });
    this.emit("RETURN_VALUE", node, rule, { why });
  }

  slotOf(identId: number, name: string): number {
    const r = this.sem.resolutions.get(identId);
    if (!r || r.kind !== "local") throw new Error(`'${name}' is not a local variable`);
    return r.slot;
  }

  // ---- declarations / statements ----

  decl(d: A.Decl) {
    if (d.kind === "ClassDecl") return this.classDecl(d);
    if (d.kind !== "FuncDecl") return this.stmt(d);
    this.funcBody(d, this.sem.fnCode.get(d.id) ?? d.name);
  }

  code(name: string): CodeObject {
    const code = this.program.functions.find((f) => f.name === name);
    if (!code) throw new Error(`no code object ${name}`);
    return code;
  }

  // A function or method body into its own code object (methods are named
  // "Class.method" and have self in slot 0).
  funcBody(d: A.FuncDecl, codeName: string) {
    this.cur = this.code(codeName);
    this.step("begin-code", d, irMessages.beginCode(codeName, this.cur.params), `open code object ${codeName}`);
    this.stmt(d.body);
    this.returnNone(d, IR_RULES.FuncDecl, true);
    this.finish(d);
    this.cur = this.program.main;
  }

  // A class is only code objects: its field initializers, then its methods.
  classDecl(c: A.ClassDecl) {
    const info = this.sem.classes.find((x) => x.name === c.name)!;
    if (info.fieldsCode) {
      this.cur = this.code(info.fieldsCode);
      this.step("begin-code", c, irMessages.beginCode(info.fieldsCode, ["self"]), `open code object ${info.fieldsCode}`);
      for (const f of c.fields) {
        if (!f.init) continue;
        this.enter(f, `${f.name} =`, IR_RULES.FieldInit);
        this.expr(f.init);
        this.emit("LOAD_FAST", f, IR_RULES.FieldInit, { arg: 0 });
        this.emit("STORE_ATTR", f, IR_RULES.FieldInit, { arg: this.nameIndex(f.name) });
        this.finish(f);
      }
      this.returnNone(c, IR_RULES.FieldInit, true);
      this.cur = this.program.main;
    }
    for (const m of c.methods) this.funcBody(m, this.sem.fnCode.get(m.id)!);
    this.finish(c);
  }

  stmt(s: A.Stmt): void {
    switch (s.kind) {
      case "LetStmt":
        this.enter(s, s.name, IR_RULES.LetStmt);
        this.expr(s.value);
        this.emit("STORE_FAST", s, IR_RULES.LetStmt, { arg: this.sem.declSlots.get(s.id) ?? this.missing(s.name) });
        break;
      case "AssignStmt":
        if (s.target.kind === "Identifier") {
          this.enter(s, `${s.target.name} =`, IR_RULES.AssignName);
          this.expr(s.value);
          this.emit("STORE_FAST", s, IR_RULES.AssignName, { arg: this.slotOf(s.target.id, s.target.name) });
          this.finish(s.target);
        } else if (s.target.kind === "MemberExpr") {
          this.enter(s, `.${s.target.name} =`, IR_RULES.AssignField);
          this.expr(s.value);
          this.expr(s.target.object);
          this.emit("STORE_ATTR", s, IR_RULES.AssignField, { arg: this.nameIndex(s.target.name) });
          this.finish(s.target);
        } else if (s.target.kind === "IndexExpr") {
          this.enter(s, "[…] =", IR_RULES.AssignIndex);
          this.expr(s.value);
          this.expr(s.target.object);
          this.expr(s.target.index);
          this.emit("STORE_SUBSCR", s, IR_RULES.AssignIndex);
          this.finish(s.target);
        } else throw new Error("assignment target is not an lvalue");
        break;
      case "PrintStmt":
        this.enter(s, "", IR_RULES.PrintStmt);
        this.expr(s.value);
        this.emit("PRINT", s, IR_RULES.PrintStmt);
        break;
      case "ExprStmt":
        this.enter(s, "", IR_RULES.ExprStmt);
        this.expr(s.expr);
        this.emit("POP_TOP", s, IR_RULES.ExprStmt);
        break;
      case "ReturnStmt":
        this.enter(s, "", IR_RULES.ReturnStmt);
        if (s.value) {
          this.expr(s.value);
          this.emit("RETURN_VALUE", s, IR_RULES.ReturnStmt);
        } else this.returnNone(s, IR_RULES.ReturnStmt, false);
        break;
      case "Block":
        for (const t of s.statements) this.stmt(t);
        break;
      case "IfStmt": {
        const r = IR_RULES.IfStmt;
        this.enter(s, "", r);
        this.expr(s.condition);
        const lElse = this.newLabel();
        const jElse = this.emit("POP_JUMP_IF_FALSE", s, r, { target: lElse, pending: true });
        this.stmt(s.thenBranch);
        if (s.elseBranch) {
          const lEnd = this.newLabel();
          const jEnd = this.emit("JUMP_FORWARD", s, r, { target: lEnd, pending: true });
          this.place(lElse, s, jElse);
          this.stmt(s.elseBranch);
          this.place(lEnd, s, jEnd);
        } else this.place(lElse, s, jElse);
        break;
      }
      case "WhileStmt": {
        const r = IR_RULES.WhileStmt;
        this.enter(s, "", r);
        const lTop = this.newLabel();
        this.place(lTop, s);
        this.expr(s.condition);
        const lEnd = this.newLabel();
        const jEnd = this.emit("POP_JUMP_IF_FALSE", s, r, { target: lEnd, pending: true });
        this.stmt(s.body);
        this.emit("JUMP_BACKWARD", s, r, { target: lTop });
        this.place(lEnd, s, jEnd);
        break;
      }
      case "ForEachStmt": {
        // code(e) · GET_ITER · top: FOR_ITER end · STORE_FAST x · body · JUMP_BACKWARD top · end:
        const r = IR_RULES.ForEach;
        this.enter(s, `${s.name} in`, r);
        this.expr(s.iterable);
        this.emit("GET_ITER", s, r);
        const lTop = this.newLabel();
        this.place(lTop, s);
        const lEnd = this.newLabel();
        const jEnd = this.emit("FOR_ITER", s, r, { target: lEnd, pending: true });
        this.emit("STORE_FAST", s, r, { arg: this.sem.declSlots.get(s.id) ?? this.missing(s.name) });
        this.stmt(s.body);
        this.emit("JUMP_BACKWARD", s, r, { target: lTop });
        this.place(lEnd, s, jEnd);
        break;
      }
      case "ForStmt": {
        const tree = this.desugar(s);
        this.step("desugar", s, irMessages.desugar(), "desugar for → while", { tree });
        this.stmt(tree);
        break;
      }
    }
    this.finish(s);
  }

  missing(name: string): never {
    throw new Error(`no slot recorded for '${name}'`);
  }

  // { init; while (cond ?? true) { body; update; } } — synthetic wrapper
  // nodes get negative ids (never collide with parser ids) and reuse the
  // for-loop's span so the code panel still points at the source.
  desugar(f: A.ForStmt): A.Block {
    const span = f.span;
    const id = () => this.nextSynthId--;
    const cond: A.Expr = f.condition ?? { kind: "BoolLiteral", value: true, id: id(), span };
    const body: A.Block = { kind: "Block", id: id(), span: f.body.span, statements: [f.body, ...(f.update ? [f.update] : [])] };
    const loop: A.WhileStmt = { kind: "WhileStmt", id: id(), span, condition: cond, body };
    return { kind: "Block", id: id(), span, statements: [...(f.init ? [f.init] : []), loop] };
  }

  // ---- expressions ----

  expr(e: A.Expr): void {
    switch (e.kind) {
      case "NumberLiteral":
      case "FloatLiteral":
      case "NoneLiteral":
      case "StringLiteral":
      case "BoolLiteral":
        this.emit("LOAD_CONST", e, IR_RULES.Literal, { arg: this.constIndex(e.value) });
        break;
      case "Identifier":
        this.emit("LOAD_FAST", e, IR_RULES.Identifier, { arg: this.slotOf(e.id, e.name) });
        break;
      case "ArrayLiteral":
        this.enter(e, `[${e.elements.length}]`, IR_RULES.ArrayLiteral);
        for (const x of e.elements) this.expr(x);
        this.emit("BUILD_LIST", e, IR_RULES.ArrayLiteral, { arg: e.elements.length });
        break;
      case "ScaleLiteral":
      case "ClutchLiteral": {
        const scale = e.kind === "ScaleLiteral";
        const rule = scale ? IR_RULES.ScaleLiteral : IR_RULES.ClutchLiteral;
        this.enter(e, `${scale ? "@(" : "@["}${e.elements.length}${scale ? ")" : "]"}`, rule);
        for (const x of e.elements) this.expr(x);
        this.emit(scale ? "BUILD_SCALE" : "BUILD_CLUTCH", e, rule, { arg: e.elements.length });
        break;
      }
      case "DenLiteral":
        this.enter(e, `@{${e.entries.length}}`, IR_RULES.DenLiteral);
        for (const x of e.entries) { this.expr(x.key); this.expr(x.value); }
        this.emit("BUILD_DEN", e, IR_RULES.DenLiteral, { arg: e.entries.length });
        break;
      case "MemberExpr":
        this.enter(e, `.${e.name}`, IR_RULES.FieldRead);
        this.expr(e.object);
        this.emit("LOAD_ATTR", e, IR_RULES.FieldRead, { arg: this.nameIndex(e.name) });
        break;
      case "SelfExpr":
        this.emit("LOAD_FAST", e, IR_RULES.Self, { arg: 0 });
        break;
      case "SuperExpr":
        throw new Error("super.m must be called (Phase 3 rejects bare super.m)");
      case "NewExpr":
        this.enter(e, `new ${e.className}`, IR_RULES.NewExpr);
        this.emit("LOAD_GLOBAL", e, IR_RULES.NewExpr, { arg: this.nameIndex(e.className) });
        for (const a of e.args) this.expr(a);
        this.emit("CALL", e, IR_RULES.NewExpr, { arg: e.args.length });
        break;
      case "BinaryExpr": {
        const cmp = (COMPARE_OPS as readonly string[]).indexOf(e.operator);
        const rule = cmp >= 0 ? IR_RULES.CompareExpr : IR_RULES.BinaryExpr;
        this.enter(e, e.operator, rule);
        this.expr(e.left);
        this.expr(e.right);
        if (cmp >= 0) this.emit("COMPARE_OP", e, rule, { arg: cmp });
        else this.emit("BINARY_OP", e, rule, { arg: (BINARY_OPS as readonly string[]).indexOf(e.operator) });
        break;
      }
      case "LogicalExpr": {
        const rule = e.operator === "&&" ? IR_RULES.And : IR_RULES.Or;
        this.enter(e, e.operator, rule);
        this.expr(e.left);
        const l = this.newLabel();
        const j = this.emit(e.operator === "&&" ? "JUMP_IF_FALSE_OR_POP" : "JUMP_IF_TRUE_OR_POP", e, rule, { target: l, pending: true });
        this.expr(e.right);
        this.place(l, e, j);
        break;
      }
      case "UnaryExpr":
        this.enter(e, e.operator, IR_RULES.UnaryExpr);
        this.expr(e.operand);
        this.emit(e.operator === "-" ? "UNARY_NEGATIVE" : "UNARY_NOT", e, IR_RULES.UnaryExpr);
        break;
      case "CallExpr": {
        if (e.callee.kind === "MemberExpr") {
          const m = e.callee;
          this.enter(e, `.${m.name}(…)`, IR_RULES.MethodCall);
          this.expr(m.object);
          this.emit("LOAD_METHOD", m, IR_RULES.MethodCall, { arg: this.nameIndex(m.name) });
          this.finish(m);
          for (const a of e.args) this.expr(a);
          this.emit("CALL", e, IR_RULES.MethodCall, { arg: e.args.length });
          break;
        }
        if (e.callee.kind === "SuperExpr") {
          const r = this.sem.resolutions.get(e.callee.id);
          if (r?.kind !== "function") throw new Error("super call was not resolved");
          this.enter(e, `super.${e.callee.name}(…)`, IR_RULES.SuperCall);
          this.emit("LOAD_GLOBAL", e.callee, IR_RULES.SuperCall, { arg: this.nameIndex(r.name) });
          this.emit("LOAD_FAST", e.callee, IR_RULES.SuperCall, { arg: 0 });
          this.finish(e.callee);
          for (const a of e.args) this.expr(a);
          this.emit("CALL", e, IR_RULES.SuperCall, { arg: e.args.length + 1 });
          break;
        }
        if (e.callee.kind !== "Identifier") throw new Error("only a named function can be called");
        const r = this.sem.resolutions.get(e.callee.id);
        if (r?.kind === "builtin") {
          this.enter(e, `${r.name}(…)`, IR_RULES.Builtin);
          this.finish(e.callee);
          for (const a of e.args) this.expr(a);
          this.emit("CALL_BUILTIN", e, IR_RULES.Builtin, { arg: (BUILTINS as readonly string[]).indexOf(r.name) });
          break;
        }
        const name = r?.kind === "function" ? r.name : e.callee.name;
        this.enter(e, `${name}(…)`, IR_RULES.CallExpr);
        this.emit("LOAD_GLOBAL", e.callee, IR_RULES.CallExpr, { arg: this.nameIndex(name) });
        this.finish(e.callee);
        for (const a of e.args) this.expr(a);
        this.emit("CALL", e, IR_RULES.CallExpr, { arg: e.args.length });
        break;
      }
      case "IndexExpr":
        this.enter(e, "[]", IR_RULES.IndexExpr);
        this.expr(e.object);
        this.expr(e.index);
        this.emit("BINARY_SUBSCR", e, IR_RULES.IndexExpr);
        break;
    }
    this.finish(e);
  }
}

function itemLabel(d: A.Decl): string {
  switch (d.kind) {
    case "FuncDecl": return `fn ${d.name}`;
    case "ClassDecl": return `class ${d.name}`;
    case "LetStmt": return `let ${d.name}`;
    case "AssignStmt": return d.target.kind === "Identifier" ? `${d.target.name} =` : "assign";
    case "PrintStmt": return "print";
    case "IfStmt": return "if";
    case "WhileStmt": return "while";
    case "ForStmt": return "for";
    case "ForEachStmt": return `for ${d.name} in`;
    case "ReturnStmt": return "return";
    case "Block": return "block";
    case "ExprStmt": return "expr";
  }
}

export function generate(ast: A.Program, sem: SemanticInfo): PhaseResult<IrGenStep, IrProgram> {
  const g = new Generator(sem);
  const chapters: Chapter[] = [];
  let error: string | undefined;
  try {
    ast.items.forEach((d, i) => {
      g.item = i;
      const start = g.steps.length;
      g.decl(d);
      if (g.steps.length > start) chapters.push({ start, end: g.steps.length - 1, label: itemLabel(d) });
    });
    g.item = ast.items.length;
    const start = g.steps.length;
    g.returnNone(ast, IR_RULES.Program, true);
    chapters.push({ start, end: g.steps.length - 1, label: "end of <main>" });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  // Each step's "next" cell names what the following step does, so the grid
  // never promises something the walk doesn't then do.
  g.steps.forEach((s, i) => {
    s.explain.next = i + 1 < g.steps.length ? irMessages.next(g.summaries[i + 1]) : irMessages.done;
  });

  if (error !== undefined) {
    const last = g.steps[g.steps.length - 1];
    g.steps.push({
      action: "error", code: g.cur.name, codeRef: g.cur, item: g.item, instrs: g.snapshot(), finished: [],
      span: last?.span, explain: irMessages.error(error),
    });
    const start = chapters.length ? chapters[chapters.length - 1].end + 1 : 0;
    chapters.push({ start, end: g.steps.length - 1, label: "error" });
    return { ok: false, trace: g.steps, chapters, error: { message: error, span: last?.span } };
  }
  return { ok: true, trace: g.steps, chapters, output: g.program };
}
