// Semantic Analysis (phase 3): the context-sensitive checks a CFG/PDA can't
// do (docs/phase34plan.md §2, §7.5, §10). Two passes over the AST:
//   1. hoist every fn name + arity into the bottom "functions" scope;
//   2. depth-first walk with a stack of lexical scopes (the symbol table),
//      resolving names to slots and typing every expression.
// First error stops the phase. Prose comes from messages/semantic.ts.
import type {
  AssignStmt, Block, Expr, ForStmt, FuncDecl, Identifier, IndexExpr, Program, Stmt,
} from "./ast.ts";
import type { Chapter, Explanation, PhaseError, PhaseResult, Span, TraceStep } from "./trace.ts";
import { typeToString, type CodeScopeInfo, type Resolution, type SemanticInfo, type SnekType } from "./semanticTypes.ts";
import { HOIST_CHAPTER_LABEL, semChapterLabel, semMsg, show } from "./messages/semantic.ts";

export type SemAction = "hoist" | "enter-scope" | "exit-scope" | "declare" | "resolve" | "type-check" | "error";

export interface ScopeView {
  kind: string; // "functions" | "<main>" | "fn <name>" | "block" | "for"
  entries: { name: string; type: string; slot: number }[]; // slot -1 = function (no slot)
}

export interface SemStep extends TraceStep {
  action: SemAction;
  nodeId?: number;
  nodeType?: string;   // type assigned to the Expr `nodeId` at this step (views accumulate these as badges)
  scopes: ScopeView[]; // full symbol-table snapshot after the step, bottom → top
  popped?: ScopeView;  // exit-scope only: the scope just popped
}

interface Sym { type: SnekType; slot: number; fn: boolean }
interface Scope { kind: string; syms: Map<string, Sym> }

const INT: SnekType = { kind: "int" };
const BOOL: SnekType = { kind: "bool" };
const STRING: SnekType = { kind: "string" };
const UNKNOWN: SnekType = { kind: "unknown" };

// `unknown` is compatible with everything statically — the VM checks it.
const fits = (t: SnekType, k: SnekType["kind"]) => t.kind === k || t.kind === "unknown";

function sameType(a: SnekType, b: SnekType): boolean {
  if (a.kind === "unknown" || b.kind === "unknown") return true;
  if (a.kind === "array" && b.kind === "array") return sameType(a.element, b.element);
  if (a.kind === "fn" && b.kind === "fn") return a.arity === b.arity;
  return a.kind === b.kind;
}

const HALT = Symbol("semantic-halt");

export function analyze(ast: Program): PhaseResult<SemStep, SemanticInfo> {
  const trace: SemStep[] = [];
  const chapters: Chapter[] = [];
  const types = new Map<number, SnekType>();
  const resolutions = new Map<number, Resolution>();
  const declSlots = new Map<number, number>();
  const main: CodeScopeInfo = { name: "<main>", params: [], nslots: 0, slotNames: [] };
  const functions: CodeScopeInfo[] = [];
  const fnScope: Scope = { kind: "functions", syms: new Map() };
  let stack: Scope[] = [fnScope, { kind: "<main>", syms: new Map() }];
  let code = main;
  let error: PhaseError | undefined;
  // Only for the error message: a fn body reading a top-level let gets the
  // §7.5 explanation instead of a bare "undeclared".
  const topLets = new Set(ast.items.flatMap((i) => (i.kind === "LetStmt" ? [i.name] : [])));

  const viewScope = (s: Scope): ScopeView => ({
    kind: s.kind,
    entries: [...s.syms].map(([name, sym]) => ({ name, type: typeToString(sym.type), slot: sym.slot })),
  });

  function emit(action: SemAction, node: { id: number; span: Span }, explain: Explanation, extra?: Partial<SemStep>) {
    trace.push({ action, nodeId: node.id, span: node.span, scopes: stack.map(viewScope), explain, ...extra });
  }

  function fail(node: { id: number; span: Span }, explain: Explanation): never {
    error = { message: explain.what, span: node.span };
    emit("error", node, explain);
    throw HALT;
  }

  function setType(e: Expr, t: SnekType, explain: Explanation): SnekType {
    types.set(e.id, t);
    emit(e.kind === "Identifier" ? "resolve" : "type-check", e, explain, { nodeType: typeToString(t) });
    return t;
  }

  function pushScope(kind: string, node: { id: number; span: Span }, params: string[] = []) {
    stack.push({ kind, syms: new Map() });
    emit("enter-scope", node, semMsg.enterScope(kind, params));
  }

  function popScope(node: { id: number; span: Span }) {
    const top = stack.pop()!;
    emit("exit-scope", node, semMsg.exitScope(top.kind, [...top.syms.keys()]), { popped: viewScope(top) });
  }

  function declare(node: { id: number; span: Span }, name: string, type: SnekType, isParam: boolean) {
    const top = stack[stack.length - 1];
    if (top.syms.has(name)) fail(node, semMsg.redeclare(name, top.kind));
    // Slots are never reused within a code object, so a shadowing name gets a
    // fresh slot and IR generation can address every declaration directly.
    const slot = code.nslots++;
    code.slotNames.push(name);
    top.syms.set(name, { type, slot, fn: false });
    declSlots.set(node.id, slot);
    emit("declare", node, semMsg.declare(name, type, slot, code.name, isParam));
  }

  type Use = "value" | "callee" | "target";

  function resolve(id: Identifier, use: Use): { sym: Sym } {
    for (let d = stack.length - 1; d >= 0; d--) {
      const sym = stack[d].syms.get(id.name);
      if (!sym) continue;
      if (sym.fn) {
        resolutions.set(id.id, { kind: "function", name: id.name });
        if (use === "value") fail(id, semMsg.fnAsValue(id.name));
        if (use === "target") fail(id, semMsg.assignFunction(id.name));
        const arity = sym.type.kind === "fn" ? sym.type.arity : 0;
        setType(id, sym.type, semMsg.resolveFunction(id.name, arity));
      } else {
        if (use === "callee") fail(id, semMsg.notCallable(id.name, sym.type));
        resolutions.set(id.id, { kind: "local", slot: sym.slot, code: code.name });
        setType(id, sym.type, semMsg.resolveLocal(id.name, sym.type, sym.slot, stack.length - 1 - d, code.name));
      }
      return { sym };
    }
    return fail(id, semMsg.undeclared(id.name, code !== main && topLets.has(id.name)));
  }

  function checkIndex(e: IndexExpr, o: SnekType, i: SnekType): SnekType {
    const ok = (o.kind === "array" || o.kind === "unknown") && fits(i, "int");
    if (!ok) fail(e, semMsg.index(e, o, i, null));
    const res = o.kind === "array" ? o.element : UNKNOWN;
    return setType(e, res, semMsg.index(e, o, i, res));
  }

  function expr(e: Expr): SnekType {
    switch (e.kind) {
      case "NumberLiteral": return setType(e, INT, semMsg.literal(e, INT));
      case "StringLiteral": return setType(e, STRING, semMsg.literal(e, STRING));
      case "BoolLiteral": return setType(e, BOOL, semMsg.literal(e, BOOL));
      case "Identifier": return resolve(e, "value").sym.type;
      case "ArrayLiteral": {
        const ts = e.elements.map(expr);
        if (ts.length === 0) return setType(e, UNKNOWN, semMsg.array(e, UNKNOWN));
        const first = ts.find((t) => t.kind !== "unknown") ?? UNKNOWN;
        const bad = ts.find((t) => !sameType(first, t));
        if (bad) fail(e, semMsg.array(e, null, first, bad));
        const res: SnekType = { kind: "array", element: first };
        return setType(e, res, semMsg.array(e, res));
      }
      case "UnaryExpr": {
        const t = expr(e.operand);
        const want = e.operator === "-" ? INT : BOOL;
        if (!fits(t, want.kind)) fail(e, semMsg.unary(e, t, null));
        return setType(e, want, semMsg.unary(e, t, want));
      }
      case "LogicalExpr":
      case "BinaryExpr": {
        const l = expr(e.left);
        const r = expr(e.right);
        const res = binaryResult(e.operator, l, r);
        if (!res) fail(e, semMsg.binary(e, l, r, null));
        return setType(e, res, semMsg.binary(e, l, r, res));
      }
      case "IndexExpr": {
        const o = expr(e.object);
        return checkIndex(e, o, expr(e.index));
      }
      case "CallExpr": {
        if (e.callee.kind !== "Identifier") fail(e.callee, semMsg.notCallable(show(e.callee), null));
        const { sym } = resolve(e.callee, "callee");
        e.args.forEach(expr);
        const arity = sym.type.kind === "fn" ? sym.type.arity : 0;
        if (arity !== e.args.length) fail(e, semMsg.call(e.callee.name, arity, e.args.length));
        return setType(e, UNKNOWN, semMsg.call(e.callee.name, arity, e.args.length));
      }
    }
  }

  function condition(s: Stmt, c: Expr) {
    const t = expr(c);
    if (!fits(t, "bool")) fail(c, semMsg.condition(s, t));
    emit("type-check", s, semMsg.condition(s, t));
  }

  function assign(s: AssignStmt) {
    const target = s.target;
    let tt: SnekType;
    if (target.kind === "Identifier") {
      tt = resolve(target, "target").sym.type;
    } else if (target.kind === "IndexExpr") {
      const o = expr(target.object);
      if (o.kind === "string") fail(target, semMsg.stringElement());
      tt = checkIndex(target, o, expr(target.index));
    } else {
      return fail(target, semMsg.lvalue(target));
    }
    const vt = expr(s.value);
    if (!sameType(tt, vt)) fail(s, semMsg.assign(target, tt, vt, false));
    emit("type-check", s, semMsg.assign(target, tt, vt, true));
  }

  function block(b: Block, kind = "block") {
    pushScope(kind, b);
    b.statements.forEach(stmt);
    popScope(b);
  }

  function forStmt(s: ForStmt) {
    // The header gets its own scope so `let i` dies with the loop; the body
    // Block then nests a further scope inside it.
    pushScope("for", s);
    if (s.init) stmt(s.init);
    if (s.condition) condition(s, s.condition);
    if (s.update) stmt(s.update);
    block(s.body);
    popScope(s);
  }

  function stmt(s: Stmt) {
    switch (s.kind) {
      case "LetStmt": declare(s, s.name, expr(s.value), false); break;
      case "AssignStmt": assign(s); break;
      case "PrintStmt": expr(s.value); break;
      case "ExprStmt": expr(s.expr); break;
      case "IfStmt":
        condition(s, s.condition);
        block(s.thenBranch);
        if (s.elseBranch) block(s.elseBranch);
        break;
      case "WhileStmt":
        condition(s, s.condition);
        block(s.body);
        break;
      case "ForStmt": forStmt(s); break;
      case "ReturnStmt":
        if (code === main) fail(s, semMsg.returnOutside());
        emit("type-check", s, semMsg.returnOk(code.name));
        if (s.value) expr(s.value);
        break;
      case "Block": block(s); break;
    }
  }

  function funcDecl(f: FuncDecl, info: CodeScopeInfo) {
    // A fn body's scope sits directly on the functions scope: the <main>
    // scope is swapped out, which is exactly "no top-level lets visible".
    const saved = stack;
    stack = [fnScope];
    code = info;
    pushScope(`fn ${f.name}`, f, info.params);
    f.params.forEach((p) => declare(p, p.name, UNKNOWN, true));
    f.body.statements.forEach(stmt);
    const top = stack.pop()!;
    stack = saved;
    code = main;
    emit("exit-scope", f, semMsg.exitScope(top.kind, [...top.syms.keys()]), { popped: viewScope(top) });
  }

  let chapterStart = 0;
  const closeChapter = (label: string) => {
    if (trace.length > chapterStart) chapters.push({ start: chapterStart, end: trace.length - 1, label });
    chapterStart = trace.length;
  };

  let label = HOIST_CHAPTER_LABEL;
  try {
    const infos = new Map<FuncDecl, CodeScopeInfo>();
    for (const item of ast.items) {
      if (item.kind !== "FuncDecl") continue;
      if (fnScope.syms.has(item.name)) fail(item, semMsg.redeclare(item.name, fnScope.kind));
      const info: CodeScopeInfo = { name: item.name, params: item.params.map((p) => p.name), nslots: 0, slotNames: [] };
      functions.push(info);
      infos.set(item, info);
      fnScope.syms.set(item.name, { type: { kind: "fn", arity: item.params.length }, slot: -1, fn: true });
      emit("hoist", item, semMsg.hoist(item.name, item.params.length));
    }
    closeChapter(label);
    for (const item of ast.items) {
      label = semChapterLabel(item);
      if (item.kind === "FuncDecl") funcDecl(item, infos.get(item)!);
      else stmt(item);
      closeChapter(label);
    }
  } catch (e) {
    if (e !== HALT) throw e;
    closeChapter(label);
    return { ok: false, trace, chapters, error };
  }
  return { ok: true, trace, chapters, output: { types, resolutions, declSlots, main, functions } };
}

function binaryResult(op: string, l: SnekType, r: SnekType): SnekType | null {
  switch (op) {
    case "+":
      if (l.kind === "unknown" && r.kind === "unknown") return UNKNOWN;
      if (fits(l, "int") && fits(r, "int")) return INT;
      if (fits(l, "string") && fits(r, "string")) return STRING;
      return null;
    case "-": case "*": case "/":
      return fits(l, "int") && fits(r, "int") ? INT : null;
    case "<": case ">": case "<=": case ">=":
      return fits(l, "int") && fits(r, "int") ? BOOL : null;
    case "==": case "!=": {
      const scalar = (t: SnekType) => ["int", "bool", "string", "unknown"].includes(t.kind);
      return scalar(l) && scalar(r) && sameType(l, r) ? BOOL : null;
    }
    default: // && ||
      return fits(l, "bool") && fits(r, "bool") ? BOOL : null;
  }
}
