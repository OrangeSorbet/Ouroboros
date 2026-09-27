// Human-readable text for Semantic Analysis (phase 3). semantic.ts produces
// raw steps and calls these builders for the four explanation cells; no
// prose lives in the engine. Rules cited here are docs/phase34plan.md §7.5.
import type { Decl, Expr, Stmt } from "../ast.ts";
import type { Explanation } from "../trace.ts";
import { typeToString, type SnekType } from "../semanticTypes.ts";

const ty = (t: SnekType) => typeToString(t);

// Short source-like rendering of an expression for the Formal cell, so a
// judgement reads `Γ ⊢ x + true` rather than "the BinaryExpr".
export function show(e: Expr): string {
  const s = render(e);
  return s.length > 28 ? s.slice(0, 27) + "…" : s;
}

function render(e: Expr): string {
  switch (e.kind) {
    case "NumberLiteral": return e.value.toString();
    case "StringLiteral": return JSON.stringify(e.value);
    case "BoolLiteral": return String(e.value);
    case "Identifier": return e.name;
    case "ArrayLiteral": return `[${e.elements.map(render).join(", ")}]`;
    case "BinaryExpr":
    case "LogicalExpr": return `${render(e.left)} ${e.operator} ${render(e.right)}`;
    case "UnaryExpr": return `${e.operator}${render(e.operand)}`;
    case "CallExpr": return `${render(e.callee)}(${e.args.map(render).join(", ")})`;
    case "IndexExpr": return `${render(e.object)}[${render(e.index)}]`;
  }
}

export function semChapterLabel(item: Decl): string {
  switch (item.kind) {
    case "FuncDecl": return `fn ${item.name}`;
    case "LetStmt": return `let ${item.name}`;
    case "AssignStmt": return `assign ${show(item.target)}`;
    case "PrintStmt": return "print";
    case "IfStmt": return "if";
    case "WhileStmt": return "while";
    case "ForStmt": return "for";
    case "ReturnStmt": return "return";
    case "Block": return "block";
    case "ExprStmt": return show(item.expr);
  }
}

export const HOIST_CHAPTER_LABEL = "hoist fns";
export const SEM_ERROR_BANNER = "semantic error — compilation stops here";

const WHY_NOT_CF =
  "Declare-before-use has the shape { w c w } (a name must reappear later), which is not context-free — no PDA can check it; a symbol table can.";
const WHY_RICE =
  "Exact static typing is undecidable (Rice), so Snek checks a decidable approximation: only what literals and declarations make knowable.";

const stmtWord: Record<Stmt["kind"], string> = {
  LetStmt: "let", AssignStmt: "assignment", PrintStmt: "print", IfStmt: "if",
  WhileStmt: "while", ForStmt: "for", ReturnStmt: "return", Block: "block", ExprStmt: "expression statement",
};

export const semMsg = {
  hoist(name: string, arity: number): Explanation {
    return {
      what: `Pass 1: hoisted fn ${name} with ${arity} parameter(s) into the functions scope.`,
      why: "Functions may call each other in any order (even recursively), so all names are collected before any body is walked.",
      formal: `Γ₀ := Γ₀ ∪ { ${name} : fn(${arity}) }`,
      next: "Hoist the remaining functions, then pass 2 walks the AST depth-first.",
    };
  },

  enterScope(kind: string, params: string[]): Explanation {
    const fn = kind.startsWith("fn ");
    return {
      what: fn
        ? `Entered ${kind}: pushed its scope (params: ${params.join(", ") || "none"}). The <main> scope is hidden meanwhile.`
        : `Entered a ${kind} scope: pushed an empty scope onto the symbol-table stack.`,
      why: fn
        ? "A function body sees only its params, locals and fn names — not top-level lets, whose declared-yet status would depend on run-time call order."
        : "Lexical scopes nest like brackets, so they follow a stack discipline: the newest scope is searched first and popped first.",
      formal: `push scope: Γ' = Γ · {}   (${fn ? "fn body scope holds the params" : "`{` / `for (` opens a scope"})`,
      next: fn ? "Declare each parameter in slots 0..n-1, then check the body." : "Check the statements inside this scope.",
    };
  },

  exitScope(kind: string, names: string[]): Explanation {
    return {
      what: `Left the ${kind} scope: popped it (${names.join(", ") || "no names"} go out of scope).`,
      why: "The closing bracket ends the scope — its names are unreachable from here on, exactly like a stack pop discarding the top frame.",
      formal: "pop scope: Γ · Δ ↦ Γ   (slots stay allocated; names become invisible)",
      next: kind.startsWith("fn ") ? "Restore the <main> scope and continue with the next top-level item." : "Continue with the enclosing scope.",
    };
  },

  declare(name: string, t: SnekType, slot: number, code: string, isParam: boolean): Explanation {
    return {
      what: isParam
        ? `Declared parameter ${name} : unknown in slot ${slot} of ${code}.`
        : `Declared ${name} : ${ty(t)} in slot ${slot} of ${code}, in the innermost scope.`,
      why: isParam
        ? "Snek has no annotations; a parameter's type depends on every call site, so it stays unknown and the VM checks it at run time."
        : "Types are inferred locally: the initializer fixes the variable's type. Each declaration gets its own slot, so shadowed names never collide.",
      formal: isParam
        ? `Γ ⊢ fn(…${name}…) ⇒ Γ, ${name} : unknown @${slot}`
        : `Γ ⊢ e : ${ty(t)}, ${name} ∉ top(Γ) ⇒ Γ, ${name} : ${ty(t)} @${slot}`,
      next: "Later uses of this name resolve to this slot until its scope is popped.",
    };
  },

  resolveLocal(name: string, t: SnekType, slot: number, depth: number, code: string): Explanation {
    return {
      what: `Resolved ${name} → slot ${slot} of ${code}, type ${ty(t)} (found ${depth === 0 ? "in the top scope" : `${depth} scope(s) down`}).`,
      why: "Lookup walks the scope stack top-down, so the innermost declaration wins (shadowing) — context a CFG cannot carry.",
      formal: `Γ(${name}) = ${ty(t)} @${slot}  ⇒  Γ ⊢ ${name} : ${ty(t)}`,
      next: "Use this type to check the enclosing expression.",
    };
  },

  resolveFunction(name: string, arity: number): Explanation {
    return {
      what: `Resolved ${name} → hoisted function with ${arity} parameter(s).`,
      why: "Function names live in the bottom (hoisted) scope, visible everywhere, which is what makes calls in any order legal.",
      formal: `Γ₀(${name}) = fn(${arity})  ⇒  Γ ⊢ ${name} : fn(${arity})`,
      next: "Check the arguments and the arity of the call.",
    };
  },

  literal(e: Expr, t: SnekType): Explanation {
    return {
      what: `Literal ${show(e)} has type ${ty(t)}.`,
      why: "A literal's type is read off its token class — the base case every other typing judgement builds on.",
      formal: `⊢ ${show(e)} : ${ty(t)}   (axiom)`,
      next: "Return this type to the enclosing expression.",
    };
  },

  binary(e: Expr & { operator: string }, l: SnekType, r: SnekType, res: SnekType | null): Explanation {
    const op = e.operator;
    const rule =
      op === "+" ? "+ : int×int→int | string×string→string" :
      op === "==" || op === "!=" ? `${op} : τ×τ→bool, τ ∈ {int,bool,string}` :
      op === "&&" || op === "||" || op === "!" ? `${op} : bool×bool→bool` :
      `${op} : int×int→${"<><=>=".includes(op) ? "bool" : "int"}`;
    const unk = l.kind === "unknown" || r.kind === "unknown";
    const judge = `Γ ⊢ ${lhs(e)} : ${ty(l)}, Γ ⊢ ${rhs(e)} : ${ty(r)}`;
    if (!res) {
      return {
        what: `Type error: ${op} applied to ${ty(l)} and ${ty(r)}.`,
        why: `${op} is defined only by the rule ${rule}; Snek does no implicit conversion, so no rule applies.`,
        formal: `${judge}, no rule for ${op} : ${ty(l)} × ${ty(r)} ⇒ type error`,
        next: "Compilation stops; later phases are blocked.",
      };
    }
    return {
      what: `Checked ${op}: ${ty(l)} ${op} ${ty(r)} gives ${ty(res)}.`,
      why: unk ? WHY_RICE : `The operator table (${rule}) has a rule for these operand types.`,
      formal: `${judge} ⇒ Γ ⊢ ${show(e)} : ${ty(res)}`,
      next: "Return this type to the enclosing expression.",
    };
  },

  unary(e: Expr & { operator: string }, t: SnekType, res: SnekType | null): Explanation {
    const want = e.operator === "-" ? "int" : "bool";
    const judge = `Γ ⊢ ${lhs(e)} : ${ty(t)}`;
    if (!res) {
      return {
        what: `Type error: unary ${e.operator} applied to ${ty(t)}.`,
        why: `Unary ${e.operator} is defined only on ${want}; there is no rule for ${ty(t)}.`,
        formal: `${judge}, no rule ${e.operator} : ${ty(t)} → τ ⇒ type error`,
        next: "Compilation stops; later phases are blocked.",
      };
    }
    return {
      what: `Checked unary ${e.operator} on ${ty(t)}: result ${ty(res)}.`,
      why: t.kind === "unknown" ? WHY_RICE : `Unary ${e.operator} maps ${want} → ${want}.`,
      formal: `${judge} ⇒ Γ ⊢ ${show(e)} : ${ty(res)}`,
      next: "Return this type to the enclosing expression.",
    };
  },

  index(e: Expr, o: SnekType, i: SnekType, res: SnekType | null): Explanation {
    const judge = `Γ ⊢ a : ${ty(o)}, Γ ⊢ i : ${ty(i)}`;
    if (!res) {
      return {
        what: o.kind === "string" ? "Type error: strings are not indexable in Snek." : `Type error: cannot index ${ty(o)} with ${ty(i)}.`,
        why: "Indexing has exactly one rule, array<T>[int] → T; anything else has no derivation.",
        formal: `${judge}, rule a[i] needs a : array<T>, i : int ⇒ type error`,
        next: "Compilation stops; later phases are blocked.",
      };
    }
    return {
      what: `Checked ${show(e)}: indexing ${ty(o)} by ${ty(i)} gives ${ty(res)}.`,
      why: o.kind === "unknown" || i.kind === "unknown" ? WHY_RICE : "The rule array<T>[int] → T applies; bounds are a run-time question (VM).",
      formal: `Γ ⊢ a : array<T>, Γ ⊢ i : int ⇒ Γ ⊢ a[i] : T   (T = ${ty(res)})`,
      next: "Return this type to the enclosing expression.",
    };
  },

  array(e: Expr, res: SnekType | null, a?: SnekType, b?: SnekType): Explanation {
    if (!res) {
      return {
        what: `Type error: array literal mixes ${ty(a!)} and ${ty(b!)}.`,
        why: "Array literals must be homogeneous so array<T> has a single T — otherwise indexing would have no single result type.",
        formal: `Γ ⊢ e₁ : ${ty(a!)}, Γ ⊢ eₖ : ${ty(b!)}, ${ty(a!)} ≠ ${ty(b!)} ⇒ type error`,
        next: "Compilation stops; later phases are blocked.",
      };
    }
    return {
      what: `Array literal ${show(e)} has type ${ty(res)}.`,
      why: res.kind === "unknown" ? "[] has no element to infer T from, so it stays unknown; the VM checks its uses at run time." : "All elements share one type T, so the literal is array<T>.",
      formal: res.kind === "unknown" ? "⊢ [] : unknown" : `Γ ⊢ eᵢ : T for all i ⇒ Γ ⊢ [e₁…eₙ] : ${ty(res)}`,
      next: "Return this type to the enclosing expression.",
    };
  },

  call(name: string, arity: number, argc: number): Explanation {
    const ok = arity === argc;
    return {
      what: ok ? `Call ${name}(…) passes ${argc} argument(s), matching its arity; result is unknown.` : `Arity error: ${name} takes ${arity} argument(s), got ${argc}.`,
      why: ok ? "Arity is knowable from the hoisted declaration; the result type is not decidable in general (Rice), so it is unknown." : "The hoisted declaration fixes the parameter count; a call must supply exactly that many.",
      formal: ok ? `Γ ⊢ ${name} : fn(${arity}), |args| = ${argc} ⇒ Γ ⊢ ${name}(…) : unknown` : `Γ ⊢ ${name} : fn(${arity}), |args| = ${argc} ≠ ${arity} ⇒ arity error`,
      next: ok ? "Return unknown to the enclosing expression." : "Compilation stops; later phases are blocked.",
    };
  },

  condition(stmt: Stmt, t: SnekType): Explanation {
    const ok = t.kind === "bool" || t.kind === "unknown";
    const w = stmtWord[stmt.kind];
    return {
      what: ok ? `The ${w} condition has type ${ty(t)} — accepted.` : `Type error: the ${w} condition has type ${ty(t)}, not bool.`,
      why: ok ? (t.kind === "unknown" ? WHY_RICE : "Branching needs a truth value; Snek has no truthiness, so conditions must be bool.") : "Snek has no truthiness: a branch decision needs a bool, and there is no rule turning an int into one.",
      formal: ok ? `Γ ⊢ cond : ${ty(t)} ⇒ ${w} well-typed (cond : bool)` : `Γ ⊢ cond : ${ty(t)}, rule needs cond : bool ⇒ type error`,
      next: ok ? "Check the body." : "Compilation stops; later phases are blocked.",
    };
  },

  assign(target: Expr, tt: SnekType, vt: SnekType, ok: boolean): Explanation {
    return {
      what: ok ? `Assignment to ${show(target)} (${ty(tt)}) accepts a ${ty(vt)} value.` : `Type error: ${show(target)} is ${ty(tt)} but the value is ${ty(vt)}.`,
      why: ok ? "The target is an lvalue and the value's type matches the variable's fixed type (or is unknown, checked at run time)." : "A variable's type is fixed at its let; assigning another known type would make that type unsound.",
      formal: ok ? `Γ ⊢ ${show(target)} : ${ty(tt)}, Γ ⊢ e : ${ty(vt)} ⇒ Γ ⊢ ${show(target)} = e ok` : `Γ ⊢ ${show(target)} : ${ty(tt)}, Γ ⊢ e : ${ty(vt)}, ${ty(tt)} ≠ ${ty(vt)} ⇒ type error`,
      next: ok ? "Continue with the next statement." : "Compilation stops; later phases are blocked.",
    };
  },

  returnOk(fn: string): Explanation {
    return {
      what: `return inside fn ${fn} — allowed.`,
      why: "return only makes sense with a call frame to return to; being lexically inside a fn body guarantees one.",
      formal: `Γ ⊢ return e ok   (Γ inside fn ${fn})`,
      next: "Check the returned expression, if any.",
    };
  },

  // ---- errors that aren't a failed operator rule ----

  undeclared(name: string, topLevelLetInFn: boolean): Explanation {
    return topLevelLetInFn
      ? {
        what: `Error: ${name} is a top-level let, which function bodies cannot see.`,
        why: "Functions are hoisted; whether a global is declared yet would depend on run-time call order — not decidable, so resolution stays lexical.",
        formal: `${name} ∉ Γ_fn = Γ₀ · params · locals ⇒ undeclared`,
        next: "Compilation stops. Pass the value in as a parameter instead.",
      }
      : {
        what: `Error: ${name} is used but not declared in any enclosing scope.`,
        why: WHY_NOT_CF,
        formal: `${name} ∉ dom(Γ) (searched every scope top-down) ⇒ no judgement Γ ⊢ ${name} : τ`,
        next: "Compilation stops; later phases are blocked.",
      };
  },

  redeclare(name: string, scope: string): Explanation {
    return {
      what: `Error: ${name} is already declared in this same ${scope} scope.`,
      why: "Shadowing an outer name is fine (new scope), but two declarations in one scope would make the name ambiguous.",
      formal: `${name} ∈ top(Γ) ⇒ Γ, ${name} : τ undefined (redeclaration)`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  fnAsValue(name: string): Explanation {
    return {
      what: `Error: ${name} is a function, used here as a value.`,
      why: "Snek functions are not first-class: a function name may only appear as the callee of a call.",
      formal: `Γ ⊢ ${name} : fn(n) only in ${name}(…) position ⇒ error`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  notCallable(what: string, t: SnekType | null): Explanation {
    return {
      what: `Error: ${what} is not a function, so it cannot be called.`,
      why: "Only a name that refers to a hoisted function is callable; values (" + (t ? ty(t) : "expressions") + ") have no call rule.",
      formal: `Γ ⊢ ${what} : ${t ? ty(t) : "τ"}, τ ≠ fn(n) ⇒ no rule for call`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  returnOutside(): Explanation {
    return {
      what: "Error: return used outside any function.",
      why: "At top level there is no call frame to return to; the grammar allows it, the (context-sensitive) semantic check narrows it.",
      formal: "Γ ⊢ return e requires Γ inside a fn body ⇒ error at top level",
      next: "Compilation stops; later phases are blocked.",
    };
  },

  lvalue(target: Expr): Explanation {
    return {
      what: `Error: ${show(target)} cannot be assigned to — not an lvalue.`,
      why: "Left-factoring made the grammar accept `Expr = Expr` (a superset); semantics narrows it to names and a[i].",
      formal: "lvalue ::= IDENT | e[e]   ⇒   target ∉ lvalue ⇒ error",
      next: "Compilation stops; later phases are blocked.",
    };
  },

  stringElement(): Explanation {
    return {
      what: "Error: a string element cannot be assigned.",
      why: "Strings are immutable and not indexable in Snek; only array<T> elements are lvalues.",
      formal: "Γ ⊢ a : string ⇒ a[i] ∉ lvalue",
      next: "Compilation stops; later phases are blocked.",
    };
  },

  assignFunction(name: string): Explanation {
    return {
      what: `Error: ${name} names a function and cannot be assigned.`,
      why: "Function names are fixed by hoisting; they are not variables with a slot to overwrite.",
      formal: `Γ₀(${name}) = fn(n) ⇒ ${name} ∉ lvalue`,
      next: "Compilation stops; later phases are blocked.",
    };
  },
};

function lhs(e: Expr): string {
  if (e.kind === "BinaryExpr" || e.kind === "LogicalExpr") return show(e.left);
  if (e.kind === "UnaryExpr") return show(e.operand);
  return show(e);
}

function rhs(e: Expr): string {
  return e.kind === "BinaryExpr" || e.kind === "LogicalExpr" ? show(e.right) : "";
}
