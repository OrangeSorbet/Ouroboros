// Semantic Analysis (phase 3): the context-sensitive checks a CFG/PDA can't
// do (docs/phase34plan.md §2, §7.5, §10). Two passes over the AST:
//   1. hoist every fn name + arity into the bottom "functions" scope;
//   2. depth-first walk with a stack of lexical scopes (the symbol table),
//      resolving names to slots and typing every expression.
// First error stops the phase. Prose comes from messages/semantic.ts.
import type {
  AssignStmt, Block, CallExpr, ClassDecl, Expr, ForEachStmt, ForStmt, FuncDecl, Identifier, IndexExpr, MemberExpr, Program, Stmt,
  SuperExpr,
} from "./ast.ts";
import type { Chapter, Explanation, PhaseError, PhaseResult, Span, TraceStep } from "./trace.ts";
import { typeToString, type ClassInfo, type CodeScopeInfo, type Resolution, type SemanticInfo, type OrbType } from "./semanticTypes.ts";
import { HOIST_CHAPTER_LABEL, semChapterLabel, semMsg, show } from "./messages/semantic.ts";
import { isBuiltin, type Builtin } from "./values.ts";

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

interface Sym { type: OrbType; slot: number; fn: boolean }
interface Scope { kind: string; syms: Map<string, Sym> }

const INT: OrbType = { kind: "int" };
const FLOAT: OrbType = { kind: "float" };
const NONE: OrbType = { kind: "none" };
const BOOL: OrbType = { kind: "bool" };
const STRING: OrbType = { kind: "string" };
const UNKNOWN: OrbType = { kind: "unknown" };

// `unknown` is compatible with everything statically — the VM checks it.
const fits = (t: OrbType, k: OrbType["kind"]) => t.kind === k || t.kind === "unknown";
const isNum = (t: OrbType) => t.kind === "int" || t.kind === "float" || t.kind === "unknown";

// Parent of every class of the program being analyzed (reset per run), so
// object types can be compared by the subclass relation.
let classParent = new Map<string, string | null>();
function isSubclass(a: string, b: string): boolean {
  const seen = new Set<string>();
  for (let c: string | null | undefined = a; c && !seen.has(c); c = classParent.get(c)) {
    if (c === b) return true;
    seen.add(c);
  }
  return false;
}

// `none` may stand in for any type (a variable that has no value yet), so
// it is compatible both ways; using it as an operand is checked by the VM.
// Objects are compatible along the class chain (a Snake is an Animal).
function sameType(a: OrbType, b: OrbType): boolean {
  if (a.kind === "unknown" || b.kind === "unknown") return true;
  if (a.kind === "none" || b.kind === "none") return true;
  if (a.kind === "array" && b.kind === "array") return sameType(a.element, b.element);
  if (a.kind === "clutch" && b.kind === "clutch") return sameType(a.element, b.element);
  if (a.kind === "obj" && b.kind === "obj") return isSubclass(a.cls, b.cls) || isSubclass(b.cls, a.cls);
  if (a.kind === "den" && b.kind === "den") return sameType(a.key, b.key) && sameType(a.value, b.value);
  if (a.kind === "scale" && b.kind === "scale")
    return a.elements.length === b.elements.length && a.elements.every((t, i) => sameType(t, b.elements[i]));
  if (a.kind === "fn" && b.kind === "fn") return a.arity === b.arity;
  return a.kind === b.kind;
}

// den keys and clutch items are hashed by value, so they must be immutable
// values: scalars and scales of them (a coil could change after hashing).
const hashable = (t: OrbType): boolean =>
  ["int", "float", "bool", "string", "none", "unknown"].includes(t.kind) || (t.kind === "scale" && t.elements.every(hashable));

// Nearest class both a and b descend from (a Circle and a Square are
// both Shapes), or null when they share no ancestor.
function commonAncestor(a: string, b: string): string | null {
  const up: string[] = [];
  for (let c: string | null | undefined = a; c && !up.includes(c); c = classParent.get(c)) up.push(c);
  const seen = new Set<string>();
  for (let c: string | null | undefined = b; c && !seen.has(c); c = classParent.get(c)) {
    if (up.includes(c)) return c;
    seen.add(c);
  }
  return null;
}

// One element type for a homogeneous collection: the first known type
// (objects widen to their common ancestor), or the first pair that disagrees.
function unify(ts: OrbType[]): { type: OrbType } | { bad: [OrbType, OrbType] } {
  let acc = ts.find((t) => t.kind !== "unknown" && t.kind !== "none") ?? ts[0] ?? UNKNOWN;
  for (const t of ts) {
    if (acc.kind === "obj" && t.kind === "obj") {
      const j = commonAncestor(acc.cls, t.cls);
      if (!j) return { bad: [acc, t] };
      acc = { kind: "obj", cls: j };
    } else if (!sameType(acc, t)) return { bad: [acc, t] };
  }
  return { type: acc };
}

// What `for x in e` binds x to, per iterable type (null = not iterable).
function iterElement(t: OrbType): OrbType | null {
  switch (t.kind) {
    case "array": case "clutch": return t.element;
    case "den": return t.key;
    case "scale": { const u = unify(t.elements); return "type" in u ? u.type : UNKNOWN; }
    case "string": return STRING;
    case "unknown": return UNKNOWN;
    default: return null;
  }
}

interface MethodSig { params: OrbType[]; result: OrbType; hashArg?: boolean }

// Built-in collection methods (M2); the VM implements the same table.
function methodSig(t: OrbType, name: string): MethodSig | null {
  const NONE_T: OrbType = { kind: "none" };
  const len = name === "len" ? { params: [], result: INT } : null;
  switch (t.kind) {
    case "array":
      if (name === "push") return { params: [t.element], result: NONE_T };
      if (name === "pop") return { params: [], result: t.element };
      if (name === "has") return { params: [t.element], result: BOOL };
      return len;
    case "den":
      if (name === "has") return { params: [t.key], result: BOOL, hashArg: true };
      if (name === "remove") return { params: [t.key], result: NONE_T, hashArg: true };
      if (name === "keys") return { params: [], result: { kind: "array", element: t.key } };
      if (name === "values") return { params: [], result: { kind: "array", element: t.value } };
      return len;
    case "clutch":
      if (name === "add" || name === "remove") return { params: [t.element], result: NONE_T, hashArg: true };
      if (name === "has") return { params: [t.element], result: BOOL, hashArg: true };
      return len;
    case "scale": case "string":
      return len;
    default:
      return null;
  }
}

const HALT = Symbol("semantic-halt");
const ty = typeToString;

interface ClassSym {
  decl: ClassDecl;
  info: ClassInfo;
  fieldTypes: Map<string, OrbType>;       // own fields
  methods: Map<string, string | null>;    // own methods "name/arity" → code name (null: abstract)
  priv: Set<string>;                      // own private member names
}

const mkey = (name: string, arity: number) => `${name}/${arity}`;

export function analyze(ast: Program): PhaseResult<SemStep, SemanticInfo> {
  classParent = new Map();
  const classes = new Map<string, ClassSym>();
  let curClass: ClassSym | null = null; // class whose method / field initializer is being checked
  // The class and its ancestors, leaf first (stops on a cycle; those are
  // rejected right after hoisting).
  const chain = (name: string): ClassSym[] => {
    const out: ClassSym[] = [];
    for (let c = classes.get(name); c && !out.includes(c); c = c.info.parent ? classes.get(c.info.parent) : undefined) out.push(c);
    return out;
  };
  const findField = (cls: string, f: string) => chain(cls).find((c) => c.fieldTypes.has(f));
  const hasName = (c: ClassSym, m: string) => [...c.methods.keys()].some((k) => k.startsWith(`${m}/`));
  const findMethod = (cls: string, m: string) => chain(cls).find((c) => hasName(c, m));
  const findOverload = (cls: string, m: string, argc: number) => chain(cls).find((c) => c.methods.has(mkey(m, argc)));
  const aritiesOf = (cls: string, m: string) =>
    [...new Set(chain(cls).flatMap((c) => [...c.methods.keys()].filter((k) => k.startsWith(`${m}/`)).map((k) => Number(k.slice(m.length + 1)))))].sort((a, b) => a - b);
  // Functions, by name → (arity → code object name). Overloads differ in arity.
  const fnArities = new Map<string, Map<number, string>>();
  const fnCode = new Map<number, string>();
  const trace: SemStep[] = [];
  const chapters: Chapter[] = [];
  const types = new Map<number, OrbType>();
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
  // Classes are shown under the scopes (they are not names you can read).
  const classView = (): ScopeView[] => classes.size === 0 ? [] : [{
    kind: "classes",
    entries: [...classes.values()].map((c) => ({ name: c.info.name, type: c.info.parent ? `class : ${c.info.parent}` : "class", slot: -1 })),
  }];

  function emit(action: SemAction, node: { id: number; span: Span }, explain: Explanation, extra?: Partial<SemStep>) {
    trace.push({ action, nodeId: node.id, span: node.span, scopes: [...classView(), ...stack.map(viewScope)], explain, ...extra });
  }

  function fail(node: { id: number; span: Span }, explain: Explanation): never {
    error = { message: explain.what, span: node.span };
    emit("error", node, explain);
    throw HALT;
  }

  function setType(e: Expr, t: OrbType, explain: Explanation): OrbType {
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

  function declare(node: { id: number; span: Span }, name: string, type: OrbType, isParam: boolean) {
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
    // Not declared in any scope: a built-in, if the name is one (so a user
    // `fn len` or `let len` shadows it, like any outer name).
    if (isBuiltin(id.name)) {
      resolutions.set(id.id, { kind: "builtin", name: id.name });
      if (use === "value") fail(id, semMsg.fnAsValue(id.name));
      if (use === "target") fail(id, semMsg.assignFunction(id.name));
      const type: OrbType = { kind: "fn", arity: 1 };
      setType(id, type, semMsg.resolveBuiltin(id.name));
      return { sym: { type, slot: -1, fn: true } };
    }
    if (classes.has(id.name)) return fail(id, semMsg.classAsValue(id.name));
    return fail(id, semMsg.undeclared(id.name, code !== main && topLets.has(id.name)));
  }

  const objOf = (cls: string): OrbType => ({ kind: "obj", cls });

  function selfExpr(e: Expr): OrbType {
    if (!curClass) return fail(e, semMsg.selfOutside());
    resolutions.set(e.id, { kind: "local", slot: 0, code: code.name });
    return setType(e, objOf(curClass.info.name), semMsg.self(curClass.info.name, code.name));
  }

  // priv members (M4) are visible only inside the declaring class's own
  // methods and field initializers — not in subclasses, not outside.
  function checkPriv(node: { id: number; span: Span }, owner: ClassSym, name: string) {
    if (owner.priv.has(name) && curClass !== owner) fail(node, semMsg.privateMember(owner.info.name, name, curClass?.info.name ?? null));
  }

  // x.f as a value: a field of an object (searched up the class chain).
  function fieldRead(e: MemberExpr): OrbType {
    const o = expr(e.object);
    if (o.kind === "unknown") return setType(e, UNKNOWN, semMsg.fieldUnknown(e.name));
    if (o.kind !== "obj") return fail(e, methodSig(o, e.name) ? semMsg.memberValue(e.name) : semMsg.noField(ty(o), e.name));
    const owner = findField(o.cls, e.name);
    if (owner) {
      checkPriv(e, owner, e.name);
      const t = owner.fieldTypes.get(e.name)!;
      return setType(e, t, semMsg.fieldRead(o.cls, e.name, t, owner.info.name));
    }
    return fail(e, findMethod(o.cls, e.name) ? semMsg.memberValue(e.name) : semMsg.noField(o.cls, e.name));
  }

  // super.m(…): resolved statically to the parent chain's m (no dispatch).
  function superCall(e: CallExpr, callee: SuperExpr): OrbType {
    if (!curClass) return fail(callee, semMsg.superOutside());
    const parent = curClass.info.parent;
    const argc = e.args.length;
    if (!parent || !findMethod(parent, callee.name)) return fail(callee, semMsg.noParentMethod(curClass.info.name, callee.name, parent));
    const owner = findOverload(parent, callee.name, argc);
    if (!owner) return fail(e, semMsg.noOverload(`super.${callee.name}`, aritiesOf(parent, callee.name), argc));
    const codeName = owner.methods.get(mkey(callee.name, argc));
    if (!codeName) return fail(callee, semMsg.superAbstract(owner.info.name, callee.name));
    checkPriv(callee, owner, callee.name);
    resolutions.set(callee.id, { kind: "function", name: codeName });
    setType(callee, { kind: "fn", arity: argc }, semMsg.superResolve(curClass.info.name, callee.name, codeName));
    e.args.forEach(expr);
    return setType(e, UNKNOWN, semMsg.call(`super.${callee.name}`, argc, argc));
  }

  // coil<T>[int] → T, scale[int] → its element, den<K,V>[K] → V.
  function checkIndex(e: IndexExpr, o: OrbType, i: OrbType): OrbType {
    let res: OrbType | null = null;
    if (o.kind === "unknown") res = UNKNOWN;
    else if (o.kind === "array" && fits(i, "int")) res = o.element;
    else if (o.kind === "den" && sameType(o.key, i) && hashable(i)) res = o.value;
    else if (o.kind === "scale" && fits(i, "int")) {
      if (e.index.kind === "NumberLiteral") {
        const k = Number(e.index.value);
        res = k >= 0 && k < o.elements.length ? o.elements[k] : null;
      } else {
        const u = unify(o.elements);
        res = "type" in u ? u.type : UNKNOWN;
      }
    }
    if (!res) fail(e, semMsg.index(e, o, i, null));
    return setType(e, res, semMsg.index(e, o, i, res));
  }

  // Unify a literal's element types; `word` names the part for messages.
  function elementsOf(e: Expr, ts: OrbType[], word: string, needHash: boolean): OrbType {
    const u = unify(ts);
    if ("bad" in u) fail(e, semMsg.collection(e, word, null, u.bad[0], u.bad[1]));
    const t = (u as { type: OrbType }).type;
    if (needHash && !hashable(t)) fail(e, semMsg.unhashable(t, word));
    return t;
  }

  function method(e: CallExpr, callee: MemberExpr): OrbType {
    const recv = expr(callee.object);
    const args = e.args.map(expr);
    if (recv.kind === "unknown") return setType(e, UNKNOWN, semMsg.methodUnknown(callee.name, args.length));
    if (recv.kind === "obj") {
      // Only the existence and arity are static; which override runs is
      // decided by the VM from the object's run-time class.
      if (!findMethod(recv.cls, callee.name)) return fail(callee, semMsg.noMethod(recv, callee.name));
      const owner = findOverload(recv.cls, callee.name, args.length);
      if (!owner) return fail(e, semMsg.noOverload(`${recv.cls}.${callee.name}`, aritiesOf(recv.cls, callee.name), args.length));
      checkPriv(callee, owner, callee.name);
      return setType(e, UNKNOWN, semMsg.objMethod(recv.cls, callee.name, owner.info.name));
    }
    const sig = methodSig(recv, callee.name);
    if (!sig) return fail(callee, semMsg.noMethod(recv, callee.name));
    if (sig.params.length !== args.length) fail(e, semMsg.methodArity(recv, callee.name, sig.params.length, args.length));
    sig.params.forEach((p, k) => {
      if (!sameType(p, args[k])) fail(e.args[k], semMsg.methodArg(recv, callee.name, p, args[k]));
      if (sig.hashArg && !hashable(args[k])) fail(e.args[k], semMsg.unhashable(args[k], `${callee.name}() argument`));
    });
    return setType(e, sig.result, semMsg.method(recv, callee.name, args, sig.result));
  }

  function expr(e: Expr): OrbType {
    switch (e.kind) {
      case "NumberLiteral": return setType(e, INT, semMsg.literal(e, INT));
      case "FloatLiteral": return setType(e, FLOAT, semMsg.literal(e, FLOAT));
      case "NoneLiteral": return setType(e, NONE, semMsg.literal(e, NONE));
      case "StringLiteral": return setType(e, STRING, semMsg.literal(e, STRING));
      case "BoolLiteral": return setType(e, BOOL, semMsg.literal(e, BOOL));
      case "Identifier": return resolve(e, "value").sym.type;
      case "ArrayLiteral": {
        const ts = e.elements.map(expr);
        if (ts.length === 0) return setType(e, UNKNOWN, semMsg.collection(e, "coil", UNKNOWN));
        const res: OrbType = { kind: "array", element: elementsOf(e, ts, "coil", false) };
        return setType(e, res, semMsg.collection(e, "coil", res));
      }
      case "ScaleLiteral": {
        const res: OrbType = { kind: "scale", elements: e.elements.map(expr) };
        return setType(e, res, semMsg.collection(e, "scale", res));
      }
      case "ClutchLiteral": {
        const res: OrbType = { kind: "clutch", element: elementsOf(e, e.elements.map(expr), "clutch", true) };
        return setType(e, res, semMsg.collection(e, "clutch", res));
      }
      case "DenLiteral": {
        const ks: OrbType[] = [], vs: OrbType[] = [];
        for (const en of e.entries) { ks.push(expr(en.key)); vs.push(expr(en.value)); }
        const res: OrbType = { kind: "den", key: elementsOf(e, ks, "den key", true), value: elementsOf(e, vs, "den value", false) };
        return setType(e, res, semMsg.collection(e, "den", res));
      }
      case "MemberExpr": return fieldRead(e);
      case "SelfExpr": return selfExpr(e);
      case "SuperExpr": return fail(e, semMsg.memberValue(e.name));
      case "NewExpr": {
        const cls = classes.get(e.className);
        if (!cls) return fail(e, semMsg.unknownClass(e.className));
        if (cls.decl.abstract) return fail(e, semMsg.abstractNew(e.className));
        e.args.forEach(expr);
        const argc = e.args.length;
        const inits = aritiesOf(e.className, "init");
        const owner = findOverload(e.className, "init", argc);
        if (!owner && (inits.length > 0 || argc > 0)) fail(e, semMsg.newArity(e.className, inits, argc));
        if (owner) checkPriv(e, owner, "init");
        return setType(e, objOf(e.className), semMsg.newObj(e.className, owner ? owner.methods.get(mkey("init", argc))! : null));
      }
      case "UnaryExpr": {
        const t = expr(e.operand);
        const ok = e.operator === "-" ? isNum(t) : fits(t, "bool");
        if (!ok) fail(e, semMsg.unary(e, t, null));
        const res = e.operator === "!" ? BOOL : t;
        return setType(e, res, semMsg.unary(e, t, res));
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
        if (e.callee.kind === "MemberExpr") return method(e, e.callee);
        if (e.callee.kind === "SuperExpr") return superCall(e, e.callee);
        if (e.callee.kind !== "Identifier") fail(e.callee, semMsg.notCallable(show(e.callee), null));
        resolve(e.callee, "callee");
        const argTypes = e.args.map(expr);
        const name = e.callee.name, argc = e.args.length;
        const r = resolutions.get(e.callee.id);
        if (r?.kind === "builtin") {
          if (argc !== 1) fail(e, semMsg.call(name, 1, argc));
          const res = builtinResult(r.name as Builtin, argTypes[0]);
          if (!res) fail(e, semMsg.builtinArg(r.name, argTypes[0], null));
          return setType(e, res, semMsg.builtinArg(r.name, argTypes[0], res));
        }
        // Overloads (M4) share a name; the argument count picks one.
        const ov = fnArities.get(name)!;
        const codeName = ov.get(argc);
        if (!codeName) {
          const arities = [...ov.keys()].sort((a, b) => a - b);
          return fail(e, arities.length > 1 ? semMsg.noOverload(name, arities, argc) : semMsg.call(name, arities[0], argc));
        }
        resolutions.set(e.callee.id, { kind: "function", name: codeName });
        return setType(e, UNKNOWN, ov.size > 1 ? semMsg.overloadPick(name, argc, codeName) : semMsg.call(name, argc, argc));
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
    let tt: OrbType;
    if (target.kind === "Identifier") {
      tt = resolve(target, "target").sym.type;
    } else if (target.kind === "IndexExpr") {
      const o = expr(target.object);
      if (o.kind === "string") fail(target, semMsg.stringElement());
      if (o.kind === "scale") fail(target, semMsg.immutable());
      tt = checkIndex(target, o, expr(target.index));
    } else if (target.kind === "MemberExpr") {
      const o = expr(target.object);
      if (o.kind === "unknown") tt = UNKNOWN;
      else if (o.kind === "obj") {
        const owner = findField(o.cls, target.name);
        if (!owner) return fail(target, semMsg.noField(o.cls, target.name));
        checkPriv(target, owner, target.name);
        tt = owner.fieldTypes.get(target.name)!;
      } else return fail(target, semMsg.lvalue(target));
      types.set(target.id, tt);
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

  function forEach(s: ForEachStmt) {
    // The iterable is evaluated outside the loop; x lives in the loop's scope.
    const t = expr(s.iterable);
    const el = iterElement(t);
    if (!el) fail(s.iterable, semMsg.notIterable(t));
    pushScope("for", s);
    emit("type-check", s, semMsg.forEach(s.name, t, el!));
    declare(s, s.name, el!, false);
    block(s.body);
    popScope(s);
  }

  function stmt(s: Stmt) {
    switch (s.kind) {
      case "LetStmt": {
        // `let x = none;` means "no value yet": x's type is left to the VM.
        const t = expr(s.value);
        declare(s, s.name, t.kind === "none" ? UNKNOWN : t, false);
        break;
      }
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
      case "ForEachStmt": forEach(s); break;
      case "ReturnStmt":
        if (code === main) fail(s, semMsg.returnOutside());
        emit("type-check", s, semMsg.returnOk(code.name));
        if (s.value) expr(s.value);
        break;
      case "Block": block(s); break;
    }
  }

  // Methods and field initializers get `self` in slot 0 of their frame.
  function declareSelf(node: { id: number; span: Span }, cls: string) {
    const slot = code.nslots++;
    code.slotNames.push("self");
    stack[stack.length - 1].syms.set("self", { type: objOf(cls), slot, fn: false });
    emit("declare", node, semMsg.declareSelf(cls, code.name));
  }

  function funcDecl(f: FuncDecl, info: CodeScopeInfo) {
    // A fn body's scope sits directly on the functions scope: the <main>
    // scope is swapped out, which is exactly "no top-level lets visible".
    const saved = stack;
    stack = [fnScope];
    code = info;
    pushScope(`fn ${info.name}`, f, info.params);
    if (curClass) declareSelf(f, curClass.info.name);
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

  // A class's field initializers, checked like a method body with `self`.
  function fieldInits(d: ClassDecl, sym: ClassSym, fieldsCode: CodeScopeInfo | undefined) {
    const saved = stack;
    if (fieldsCode) {
      stack = [fnScope];
      code = fieldsCode;
      pushScope(`fields of ${d.name}`, d, ["self"]);
      declareSelf(d, d.name);
    }
    for (const fd of d.fields) {
      const t = fd.init ? expr(fd.init) : NONE;
      const ft = t.kind === "none" ? UNKNOWN : t;
      sym.fieldTypes.set(fd.name, ft);
      emit("declare", fd, semMsg.field(d.name, fd.name, ft, !!fd.init));
    }
    if (fieldsCode) {
      const top = stack.pop()!;
      stack = saved;
      code = main;
      emit("exit-scope", d, semMsg.exitScope(top.kind, [...top.syms.keys()]), { popped: viewScope(top) });
    }
  }

  function classDecl(d: ClassDecl) {
    const sym = classes.get(d.name)!;
    curClass = sym;
    fieldInits(d, sym, fieldsInfos.get(d));
    for (const m of d.methods) funcDecl(m, infos.get(m)!);
    curClass = null;
  }

  const infos = new Map<FuncDecl, CodeScopeInfo>();
  const fieldsInfos = new Map<ClassDecl, CodeScopeInfo>();
  let label = HOIST_CHAPTER_LABEL;
  try {
    // Pass 1a: classes (name, parent, members) — like functions, usable
    // before their declaration.
    for (const item of ast.items) {
      if (item.kind !== "ClassDecl") continue;
      if (classes.has(item.name)) fail(item, semMsg.redeclare(item.name, "classes"));
      const info: ClassInfo = { name: item.name, parent: item.parent, abstract: item.abstract, fields: [], methods: {}, priv: [], fieldsCode: null };
      const sym: ClassSym = { decl: item, info, fieldTypes: new Map(), methods: new Map(), priv: new Set() };
      for (const fd of item.fields) {
        if (info.fields.includes(fd.name)) fail(fd, semMsg.dupMember(item.name, fd.name, "field"));
        info.fields.push(fd.name);
        sym.fieldTypes.set(fd.name, UNKNOWN);
        if (fd.priv) sym.priv.add(fd.name);
      }
      if (item.fields.some((fd) => fd.init)) {
        const fc: CodeScopeInfo = { name: `${item.name}.<fields>`, params: ["self"], nslots: 0, slotNames: [] };
        functions.push(fc);
        fieldsInfos.set(item, fc);
        info.fieldsCode = fc.name;
      }
      // Overloads get "/arity" in their code name only when the name repeats.
      const sameName = (n: string) => [...item.methods, ...item.abstractMethods].filter((m) => m.name === n).length;
      for (const m of item.methods) {
        const key = mkey(m.name, m.params.length);
        if (sym.methods.has(key) || info.fields.includes(m.name)) fail(m, semMsg.dupMember(item.name, key, "method"));
        const codeName = `${item.name}.${sameName(m.name) > 1 ? key : m.name}`;
        const mc: CodeScopeInfo = { name: codeName, params: ["self", ...m.params.map((p) => p.name)], nslots: 0, slotNames: [] };
        functions.push(mc);
        infos.set(m, mc);
        fnCode.set(m.id, codeName);
        info.methods[key] = codeName;
        sym.methods.set(key, codeName);
        if (m.priv) sym.priv.add(m.name);
      }
      for (const am of item.abstractMethods) {
        const key = mkey(am.name, am.params.length);
        if (!item.abstract) fail(am, semMsg.abstractInConcrete(item.name, key));
        if (sym.methods.has(key) || info.fields.includes(am.name)) fail(am, semMsg.dupMember(item.name, key, "method"));
        sym.methods.set(key, null);
      }
      info.priv = [...sym.priv];
      classes.set(item.name, sym);
      classParent.set(item.name, item.parent);
      emit("hoist", item, semMsg.hoistClass(item.name, item.parent, info.fields, [...sym.methods.keys()], item.abstract));
    }
    // The inheritance graph must be a forest: every parent exists and no
    // chain loops back on itself.
    for (const c of classes.values()) {
      if (c.info.parent && !classes.has(c.info.parent)) fail(c.decl, semMsg.unknownParent(c.info.name, c.info.parent));
      const path = [c.info.name];
      for (let p = c.info.parent; p; p = classes.get(p)!.info.parent) {
        if (path.includes(p)) fail(c.decl, semMsg.inheritanceCycle([...path, p]));
        path.push(p);
      }
      if (c.info.parent) emit("type-check", c.decl, semMsg.inherits(c.info.name, path));
    }
    // A concrete class must implement every abstract method it inherits:
    // walk root → leaf, abstract adds a key, a concrete method removes it.
    for (const c of classes.values()) {
      const open = new Set<string>();
      let anyAbstract = false;
      for (const k of chain(c.info.name).reverse()) {
        for (const [key, codeName] of k.methods) {
          if (codeName === null) { open.add(key); anyAbstract = true; } else open.delete(key);
        }
      }
      if (c.decl.abstract || !anyAbstract) continue;
      if (open.size) fail(c.decl, semMsg.missingImpl(c.info.name, [...open]));
      emit("type-check", c.decl, semMsg.implementsAll(c.info.name));
    }
    const fnDecls = ast.items.filter((i): i is FuncDecl => i.kind === "FuncDecl");
    for (const item of fnDecls) {
      if (classes.has(item.name)) fail(item, semMsg.redeclare(item.name, fnScope.kind));
      const arity = item.params.length;
      const ov = fnArities.get(item.name) ?? new Map<number, string>();
      if (ov.has(arity)) fail(item, semMsg.redeclareOverload(item.name, arity));
      const overloaded = fnDecls.filter((f) => f.name === item.name).length > 1;
      const codeName = overloaded ? `${item.name}/${arity}` : item.name;
      ov.set(arity, codeName);
      fnArities.set(item.name, ov);
      const info: CodeScopeInfo = { name: codeName, params: item.params.map((p) => p.name), nslots: 0, slotNames: [] };
      functions.push(info);
      infos.set(item, info);
      fnCode.set(item.id, codeName);
      if (!fnScope.syms.has(item.name)) fnScope.syms.set(item.name, { type: { kind: "fn", arity }, slot: -1, fn: true });
      emit("hoist", item, overloaded ? semMsg.hoistOverload(item.name, arity, codeName) : semMsg.hoist(item.name, arity));
    }
    closeChapter(label);
    for (const item of ast.items) {
      label = semChapterLabel(item);
      if (item.kind === "FuncDecl") funcDecl(item, infos.get(item)!);
      else if (item.kind === "ClassDecl") classDecl(item);
      else stmt(item);
      closeChapter(label);
    }
  } catch (e) {
    if (e !== HALT) throw e;
    closeChapter(label);
    return { ok: false, trace, chapters, error };
  }
  return { ok: true, trace, chapters, output: { types, resolutions, declSlots, main, functions, classes: [...classes.values()].map((c) => c.info), fnCode } };
}

// Numeric result: int op int = int, any float operand widens to float
// (the only implicit conversion); an unknown side could be either.
function numResult(l: OrbType, r: OrbType): OrbType {
  if (l.kind === "float" || r.kind === "float") return FLOAT;
  return l.kind === "int" && r.kind === "int" ? INT : UNKNOWN;
}

function binaryResult(op: string, l: OrbType, r: OrbType): OrbType | null {
  switch (op) {
    case "+":
      if (l.kind === "unknown" && r.kind === "unknown") return UNKNOWN;
      if (isNum(l) && isNum(r)) return numResult(l, r);
      if (fits(l, "string") && fits(r, "string")) return STRING;
      return null;
    case "-": case "*": case "/":
      return isNum(l) && isNum(r) ? numResult(l, r) : null;
    case "%":
      return fits(l, "int") && fits(r, "int") ? INT : null;
    case "<": case ">": case "<=": case ">=":
      return isNum(l) && isNum(r) ? BOOL : null;
    case "==": case "!=": {
      if (l.kind === "none" || r.kind === "none") return BOOL;
      if (isNum(l) && isNum(r)) return BOOL;
      // scalars by value, scales structurally, coil/den/clutch by identity (VM)
      const comparable = (t: OrbType) => ["int", "float", "bool", "string", "unknown", "array", "scale", "den", "clutch", "obj"].includes(t.kind);
      return comparable(l) && comparable(r) && sameType(l, r) ? BOOL : null;
    }
    default: // && ||
      return fits(l, "bool") && fits(r, "bool") ? BOOL : null;
  }
}

// Argument rules for the built-ins; null = no rule (static type error).
function builtinResult(name: Builtin, t: OrbType): OrbType | null {
  const k = t.kind;
  switch (name) {
    case "len": return ["string", "array", "scale", "den", "clutch", "unknown"].includes(k) ? INT : null;
    case "str": return STRING;
    case "int": return ["int", "float", "bool", "string", "unknown"].includes(k) ? INT : null;
    case "float": return ["int", "float", "string", "unknown"].includes(k) ? FLOAT : null;
  }
}
