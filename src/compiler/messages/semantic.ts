// Human-readable text for Semantic Analysis (phase 3). semantic.ts produces
// raw steps and calls these builders for the four explanation cells; no
// prose lives in the engine. Rules cited here are docs/phase34plan.md §7.5.
import type { Decl, Expr, Stmt } from "../ast.ts";
import type { Explanation } from "../trace.ts";
import { typeToString, type OrbType } from "../semanticTypes.ts";
import { formatFloat } from "../values.ts";

const ty = (t: OrbType) => typeToString(t);

// Short source-like rendering of an expression for the Formal cell, so a
// judgement reads `Γ ⊢ x + true` rather than "the BinaryExpr".
export function show(e: Expr): string {
  const s = render(e);
  return s.length > 28 ? s.slice(0, 27) + "…" : s;
}

function render(e: Expr): string {
  switch (e.kind) {
    case "NumberLiteral": return e.value.toString();
    case "FloatLiteral": return formatFloat(e.value);
    case "NoneLiteral": return "none";
    case "StringLiteral": return JSON.stringify(e.value);
    case "BoolLiteral": return String(e.value);
    case "Identifier": return e.name;
    case "ArrayLiteral": return `[${e.elements.map(render).join(", ")}]`;
    case "ScaleLiteral": return `@(${e.elements.map(render).join(", ")})`;
    case "ClutchLiteral": return `@[${e.elements.map(render).join(", ")}]`;
    case "DenLiteral": return `@{${e.entries.map((x) => `${render(x.key)}: ${render(x.value)}`).join(", ")}}`;
    case "MemberExpr": return `${render(e.object)}.${e.name}`;
    case "SelfExpr": return "self";
    case "SuperExpr": return `super.${e.name}`;
    case "NewExpr": return `new ${e.className}(${e.args.map(render).join(", ")})`;
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
    case "ClassDecl": return `class ${item.name}`;
    case "LetStmt": return `let ${item.name}`;
    case "AssignStmt": return `assign ${show(item.target)}`;
    case "PrintStmt": return "print";
    case "IfStmt": return "if";
    case "WhileStmt": return "while";
    case "ForStmt": return "for";
    case "ForEachStmt": return `for ${item.name} in`;
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
  "Exact static typing is undecidable (Rice), so Ouroboros checks a decidable approximation: only what literals and declarations make knowable.";

const stmtWord: Record<Stmt["kind"], string> = {
  LetStmt: "let", AssignStmt: "assignment", PrintStmt: "print", IfStmt: "if",
  WhileStmt: "while", ForStmt: "for", ForEachStmt: "for-each", ReturnStmt: "return", Block: "block", ExprStmt: "expression statement",
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

  declare(name: string, t: OrbType, slot: number, code: string, isParam: boolean): Explanation {
    return {
      what: isParam
        ? `Declared parameter ${name} : unknown in slot ${slot} of ${code}.`
        : `Declared ${name} : ${ty(t)} in slot ${slot} of ${code}, in the innermost scope.`,
      why: isParam
        ? "Ouroboros has no annotations; a parameter's type depends on every call site, so it stays unknown and the VM checks it at run time."
        : "Types are inferred locally: the initializer fixes the variable's type. Each declaration gets its own slot, so shadowed names never collide.",
      formal: isParam
        ? `Γ ⊢ fn(…${name}…) ⇒ Γ, ${name} : unknown @${slot}`
        : `Γ ⊢ e : ${ty(t)}, ${name} ∉ top(Γ) ⇒ Γ, ${name} : ${ty(t)} @${slot}`,
      next: "Later uses of this name resolve to this slot until its scope is popped.",
    };
  },

  resolveLocal(name: string, t: OrbType, slot: number, depth: number, code: string): Explanation {
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

  // ---- classes (M3) ----

  hoistClass(name: string, parent: string | null, fields: string[], methods: string[], abstract: boolean): Explanation {
    return {
      what: `Pass 1: hoisted ${abstract ? "abstract " : ""}class ${name}${parent ? ` : ${parent}` : ""} — fields ${fields.join(", ") || "none"}; methods ${methods.join(", ") || "none"}.`,
      why: "Classes, like functions, may be used before their declaration, so their shapes are collected before any code is checked.",
      formal: `C := C ∪ { ${name}${parent ? ` <: ${parent}` : ""} }`,
      next: "Hoist the other classes, then check the inheritance graph.",
    };
  },

  inherits(cls: string, path: string[]): Explanation {
    return {
      what: `${cls} inherits along ${path.join(" → ")}: every parent exists and the chain ends.`,
      why: "Inheritance must form a tree (no cycles), or looking up a member could loop forever — a graph property, checked once here.",
      formal: `${path.join(" <: ")}, acyclic ⇒ lookup(${cls}, m) terminates`,
      next: "Continue with the next class, then the functions.",
    };
  },

  unknownParent(cls: string, parent: string): Explanation {
    return {
      what: `Error: class ${cls} extends ${parent}, but no class ${parent} is declared.`,
      why: "A parent supplies inherited fields and methods; an undeclared one supplies nothing to look up.",
      formal: `${parent} ∉ C ⇒ ${cls} <: ${parent} undefined`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  inheritanceCycle(path: string[]): Explanation {
    return {
      what: `Error: inheritance cycle ${path.join(" → ")}.`,
      why: "Following parents from here comes back to a class already on the path, so member lookup would never reach a root.",
      formal: `${path[0]} <:⁺ ${path[0]} ⇒ the class graph is not a tree`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  dupMember(cls: string, name: string, what: string): Explanation {
    return {
      what: `Error: class ${cls} declares ${name} twice (as a ${what}).`,
      why: "Inside one class a member name must be unique, or obj.name would be ambiguous. Redefining in a subclass is overriding, which is fine.",
      formal: `${name} ∈ members(${cls}) ⇒ second declaration rejected`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  field(cls: string, name: string, t: OrbType, hasInit: boolean): Explanation {
    return {
      what: hasInit ? `Field ${cls}.${name} : ${ty(t)} (from its initializer).` : `Field ${cls}.${name} : unknown — it starts as none.`,
      why: hasInit ? "The initializer runs for every new object, so its type is the field's type." : "Without an initializer the field starts as none; whatever init stores is checked at run time.",
      formal: `fields(${cls}) ∋ ${name} : ${ty(t)}`,
      next: "Continue with the next member.",
    };
  },

  declareSelf(cls: string, code: string): Explanation {
    return {
      what: `Slot 0 of ${code} is self : ${cls} — the object the method runs on.`,
      why: "A method is a function with one hidden first parameter: the receiver, passed by the call.",
      formal: `Γ, self : ${cls} @0 ⊢ body`,
      next: "Declare the explicit parameters from slot 1, then check the body.",
    };
  },

  self(cls: string, code: string): Explanation {
    return {
      what: `self → slot 0 of ${code}, type ${cls}.`,
      why: "Inside a class, self is always the receiver; its static type is the enclosing class (at run time it may be a subclass).",
      formal: `Γ(self) = ${cls} @0`,
      next: "Use this type to check the enclosing expression.",
    };
  },

  selfOutside(): Explanation {
    return {
      what: "Error: self used outside a class method.",
      why: "self names the receiver of a method call; outside a method there is no receiver.",
      formal: "self ∉ Γ outside a method body ⇒ error",
      next: "Compilation stops; later phases are blocked.",
    };
  },

  superOutside(): Explanation {
    return {
      what: "Error: super used outside a class method.",
      why: "super means \"the parent class of the class I am defined in\" — only meaningful inside a method.",
      formal: "super ∉ Γ outside a method body ⇒ error",
      next: "Compilation stops; later phases are blocked.",
    };
  },

  noParentMethod(cls: string, name: string, parent: string | null): Explanation {
    return {
      what: parent ? `Error: no ancestor of ${cls} has a method ${name}().` : `Error: ${cls} has no parent class, so super.${name}() has nothing to call.`,
      why: "super.m() starts the lookup at the parent, skipping the class's own m.",
      formal: `lookup(${parent ?? "∅"}, ${name}) = ⊥ ⇒ error`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  superResolve(cls: string, name: string, codeName: string): Explanation {
    return {
      what: `super.${name} in ${cls} → ${codeName}, fixed now at compile time.`,
      why: "super names one specific ancestor's method, so there is nothing for the VM to decide: this is static dispatch.",
      formal: `lookup(parent(${cls}), ${name}) = ${codeName}`,
      next: "Check the arguments and the arity.",
    };
  },

  fieldRead(cls: string, name: string, t: OrbType, owner: string): Explanation {
    return {
      what: `Field ${name} of ${cls}: type ${ty(t)}${owner !== cls ? ` (inherited from ${owner})` : ""}.`,
      why: "Fields are looked up the class chain, leaf first; a subclass object has all its ancestors' fields.",
      formal: `Γ ⊢ e : ${cls}, fields(${owner}) ∋ ${name} : ${ty(t)} ⇒ Γ ⊢ e.${name} : ${ty(t)}`,
      next: "Return this type to the enclosing expression.",
    };
  },

  fieldUnknown(name: string): Explanation {
    return {
      what: `Receiver type unknown: .${name} is left for the VM to look up.`,
      why: WHY_RICE,
      formal: `Γ ⊢ e : unknown ⇒ Γ ⊢ e.${name} : unknown   (checked at run time)`,
      next: "Return unknown to the enclosing expression.",
    };
  },

  noField(what: string, name: string): Explanation {
    return {
      what: `Type error: ${what} has no field ${name}.`,
      why: "An object's fields are exactly those declared in its class and ancestors — objects do not grow new fields.",
      formal: `${name} ∉ fields(${what}) ⇒ type error`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  objMethod(cls: string, name: string, owner: string): Explanation {
    return {
      what: `${cls}.${name}() exists (declared in ${owner}); which override runs is decided at run time.`,
      why: "The static type only proves some version exists. The object may be a subclass that overrides it — dynamic dispatch, done by the VM.",
      formal: `Γ ⊢ e : ${cls}, ${name} ∈ methods⁺(${cls}) ⇒ Γ ⊢ e.${name}(…) : unknown`,
      next: "Return unknown to the enclosing expression.",
    };
  },

  unknownClass(name: string): Explanation {
    return {
      what: `Error: new ${name}(…) — no class ${name} is declared.`,
      why: "new needs a class to know which fields to allocate and which init to run.",
      formal: `${name} ∉ C ⇒ new ${name} undefined`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  newArity(cls: string, arities: number[], got: number): Explanation {
    return {
      what: arities.length ? `Arity error: ${cls}'s init takes ${arities.join(" or ")} argument(s), got ${got}.` : `Arity error: ${cls} has no init, so new ${cls}() takes no arguments (got ${got}).`,
      why: "new passes its arguments straight to init — the nearest one up the class chain with that many parameters.",
      formal: `init/${got} ∉ methods⁺(${cls}) ⇒ arity error`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  newObj(cls: string, init: string | null): Explanation {
    return {
      what: `new ${cls}(…) has type ${cls}${init ? `; it will run ${init}` : ""}.`,
      why: "At run time new allocates the object, runs the field initializers from the root class down, then init.",
      formal: `${cls} ∈ C ⇒ Γ ⊢ new ${cls}(…) : ${cls}`,
      next: "Return this type to the enclosing expression.",
    };
  },

  // ---- encapsulation, abstraction, overloading (M4) ----

  privateMember(owner: string, name: string, from: string | null): Explanation {
    return {
      what: `Error: ${name} is private to ${owner}; it cannot be used ${from ? `from ${from}` : "outside the class"}.`,
      why: "priv hides a member behind its class's own methods, so the object's state can only change the ways the class allows.",
      formal: `priv ${owner}.${name}, access from ${from ?? "outside"} ≠ ${owner} ⇒ error`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  abstractNew(cls: string): Explanation {
    return {
      what: `Error: ${cls} is abstract, so new ${cls}(…) is not allowed.`,
      why: "An abstract class has methods with no body; an object of it would have nothing to run for them. Instantiate a concrete subclass.",
      formal: `abstract ${cls} ⇒ new ${cls} undefined`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  abstractInConcrete(cls: string, key: string): Explanation {
    return {
      what: `Error: ${cls} declares abstract fn ${key} but is not an abstract class.`,
      why: "A class that can be instantiated must have a body for every method; mark the class abstract or give the method a body.",
      formal: `abstract ${key} ∈ ${cls}, ${cls} concrete ⇒ error`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  missingImpl(cls: string, keys: string[]): Explanation {
    return {
      what: `Error: ${cls} does not implement ${keys.join(", ")}, inherited as abstract.`,
      why: "A concrete class must give a body to every abstract method up its chain, or some call on its objects would have nothing to run.",
      formal: `${keys.join(", ")} abstract in ancestors, not overridden in ${cls} ⇒ error`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  implementsAll(cls: string): Explanation {
    return {
      what: `${cls} implements every abstract method it inherits.`,
      why: "Checked once over the class chain: each abstract signature is overridden by a concrete method before the leaf.",
      formal: `∀ abstract m ∈ ancestors(${cls}): m ∈ concrete methods⁺(${cls})`,
      next: "Continue with the next class, then the functions.",
    };
  },

  superAbstract(owner: string, name: string): Explanation {
    return {
      what: `Error: super.${name}() — ${owner}.${name} is abstract and has no body.`,
      why: "super calls one fixed ancestor method; an abstract one has nothing to run.",
      formal: `lookup(parent, ${name}) is abstract ⇒ error`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  hoistOverload(name: string, arity: number, codeName: string): Explanation {
    return {
      what: `Pass 1: hoisted fn ${name} with ${arity} parameter(s) as ${codeName} — one of several overloads.`,
      why: "Overloads share a name; each gets its own code object, named with its parameter count (name mangling).",
      formal: `Γ₀ := Γ₀ ∪ { ${codeName} : fn(${arity}) }`,
      next: "Hoist the remaining functions, then pass 2 walks the AST depth-first.",
    };
  },

  redeclareOverload(name: string, arity: number): Explanation {
    return {
      what: `Error: fn ${name} with ${arity} parameter(s) is already declared.`,
      why: "Overloads must differ in parameter count — that is the only thing a call site can always tell apart.",
      formal: `${name}/${arity} ∈ Γ₀ ⇒ redeclaration`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  overloadPick(name: string, argc: number, codeName: string): Explanation {
    return {
      what: `Call ${name}(…) with ${argc} argument(s) picks the overload ${codeName}; result unknown.`,
      why: "Overloads are chosen by argument count, always known from the syntax. Choosing by argument type would need types known before run time (Rice).",
      formal: `Γ ⊢ ${name} : {${codeName}, …}, |args| = ${argc} ⇒ ${codeName}`,
      next: "Return unknown to the enclosing expression.",
    };
  },

  noOverload(name: string, arities: number[], argc: number): Explanation {
    return {
      what: `Arity error: no ${name} takes ${argc} argument(s) (there are versions with ${arities.join(", ")}).`,
      why: "The argument count selects the overload; none has this many parameters.",
      formal: `${name}/${argc} ∉ {${arities.map((a) => `${name}/${a}`).join(", ")}} ⇒ arity error`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  classAsValue(name: string): Explanation {
    return {
      what: `Error: ${name} is a class, used here as a value.`,
      why: `Classes are not first-class values; create an object with new ${name}(…).`,
      formal: `${name} ∈ C, ${name} ∉ dom(Γ) ⇒ error`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  resolveBuiltin(name: string): Explanation {
    return {
      what: `Resolved ${name} → built-in function (1 parameter); no declaration of ${name} is in scope.`,
      why: "Built-ins sit below every scope: lookup only reaches them when no user declaration shadows the name.",
      formal: `${name} ∉ dom(Γ), ${name} ∈ Builtins  ⇒  Γ ⊢ ${name} : fn(1)`,
      next: "Check the argument against the built-in's rule.",
    };
  },

  builtinArg(name: string, t: OrbType, res: OrbType | null): Explanation {
    const rules: Record<string, string> = {
      len: "len : string | array → int",
      str: "str : τ → string",
      int: "int : int | float | bool | string → int",
      float: "float : int | float | string → float",
    };
    const rule = rules[name] ?? `${name} : ?`;
    if (!res) {
      return {
        what: `Type error: ${name}() cannot take ${ty(t)}.`,
        why: `The built-in's rule is ${rule}; ${ty(t)} is not in its domain.`,
        formal: `Γ ⊢ a : ${ty(t)}, no rule ${name} : ${ty(t)} → τ ⇒ type error`,
        next: "Compilation stops; later phases are blocked.",
      };
    }
    return {
      what: `Checked ${name}(${ty(t)}): result ${ty(res)}.`,
      why: t.kind === "unknown" ? WHY_RICE : `The built-in's rule (${rule}) covers a ${ty(t)} argument.`,
      formal: `Γ ⊢ a : ${ty(t)} ⇒ Γ ⊢ ${name}(a) : ${ty(res)}`,
      next: name === "int" || name === "float" ? "A string that is not a number is still a run-time error: the VM checks the text." : "Return this type to the enclosing expression.",
    };
  },

  literal(e: Expr, t: OrbType): Explanation {
    return {
      what: `Literal ${show(e)} has type ${ty(t)}.`,
      why: "A literal's type is read off its token class — the base case every other typing judgement builds on.",
      formal: `⊢ ${show(e)} : ${ty(t)}   (axiom)`,
      next: "Return this type to the enclosing expression.",
    };
  },

  binary(e: Expr & { operator: string }, l: OrbType, r: OrbType, res: OrbType | null): Explanation {
    const op = e.operator;
    const rule =
      op === "+" ? "+ : num×num→num | string×string→string" :
      op === "%" ? "% : int×int→int" :
      op === "==" || op === "!=" ? `${op} : τ×τ→bool, τ ∈ {int,float,bool,string}, or either side none` :
      op === "&&" || op === "||" || op === "!" ? `${op} : bool×bool→bool` :
      `${op} : num×num→${"<><=>=".includes(op) ? "bool" : "num"}   (num = int | float; int op float → float)`;
    const unk = l.kind === "unknown" || r.kind === "unknown";
    const judge = `Γ ⊢ ${lhs(e)} : ${ty(l)}, Γ ⊢ ${rhs(e)} : ${ty(r)}`;
    if (!res) {
      return {
        what: `Type error: ${op} applied to ${ty(l)} and ${ty(r)}.`,
        why: `${op} is defined only by the rule ${rule}; the only implicit conversion is int → float, so no rule applies.`,
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

  unary(e: Expr & { operator: string }, t: OrbType, res: OrbType | null): Explanation {
    const want = e.operator === "-" ? "int or float" : "bool";
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

  index(e: Expr, o: OrbType, i: OrbType, res: OrbType | null): Explanation {
    const judge = `Γ ⊢ a : ${ty(o)}, Γ ⊢ i : ${ty(i)}`;
    if (!res) {
      return {
        what: o.kind === "string" ? "Type error: strings are not indexable in Ouroboros." : `Type error: cannot index ${ty(o)} with ${ty(i)}.`,
        why: o.kind === "scale" && i.kind === "int" ? "A literal index into a scale must be within its fixed length." : "Indexing rules: coil<T>[int] → T, scale[int], den<K,V>[K] → V; nothing else has a derivation.",
        formal: `${judge}, no indexing rule applies ⇒ type error`,
        next: "Compilation stops; later phases are blocked.",
      };
    }
    return {
      what: `Checked ${show(e)}: indexing ${ty(o)} by ${ty(i)} gives ${ty(res)}.`,
      why: o.kind === "unknown" || i.kind === "unknown" ? WHY_RICE
        : o.kind === "den" ? "The rule den<K,V>[K] → V applies; whether the key is present is a run-time question (VM)."
        : "An int index gives an element; bounds are a run-time question (VM).",
      formal: `${judge} ⇒ Γ ⊢ a[i] : ${ty(res)}`,
      next: "Return this type to the enclosing expression.",
    };
  },

  // Literal of a coil / scale / den / clutch; `word` also names the failing
  // part ("den key", "den value") when the elements disagree.
  collection(e: Expr, word: string, res: OrbType | null, a?: OrbType, b?: OrbType): Explanation {
    if (!res) {
      return {
        what: `Type error: ${word} literal mixes ${ty(a!)} and ${ty(b!)}.`,
        why: `Every ${word} in one literal must share a type, so the collection type has a single parameter to give back on lookup.`,
        formal: `Γ ⊢ e₁ : ${ty(a!)}, Γ ⊢ eₖ : ${ty(b!)}, ${ty(a!)} ≠ ${ty(b!)} ⇒ type error`,
        next: "Compilation stops; later phases are blocked.",
      };
    }
    const why =
      res.kind === "unknown" ? "[] has no element to infer T from, so it stays unknown; the VM checks its uses at run time."
      : word === "scale" ? "A scale is a fixed-length, immutable tuple: each position keeps its own type."
      : word === "den" ? "One key type and one value type, so every lookup has a single result type. Keys are hashed, so they must be immutable."
      : word === "clutch" ? "A clutch is a hash set: one element type, hashed by value, so duplicates collapse at run time."
      : "All elements share one type T, so the literal is coil<T>.";
    return {
      what: `${word[0].toUpperCase()}${word.slice(1)} literal ${show(e)} has type ${ty(res)}.`,
      why,
      formal: res.kind === "unknown" ? "⊢ [] : unknown" : `Γ ⊢ each part ⇒ Γ ⊢ ${show(e)} : ${ty(res)}`,
      next: "Return this type to the enclosing expression.",
    };
  },

  unhashable(t: OrbType, where: string): Explanation {
    return {
      what: `Type error: ${ty(t)} cannot be a ${where} — it is not hashable.`,
      why: "Keys and set items are placed by their hash; a mutable value (coil, den, clutch) could change after hashing and get lost.",
      formal: `hashable(τ) ⟺ τ scalar or scale of hashables; ${ty(t)} is not ⇒ type error`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  immutable(): Explanation {
    return {
      what: "Type error: scales are immutable — an element cannot be assigned.",
      why: "A scale is a fixed tuple; being immutable is what lets it be hashed as a den key or clutch item.",
      formal: "Γ ⊢ a : scale<…> ⇒ a[i] is not an lvalue",
      next: "Compilation stops. Build a new scale instead.",
    };
  },

  memberValue(name: string): Explanation {
    return {
      what: `Error: .${name} must be called — collection methods are not values.`,
      why: "In this milestone `.` only names a built-in method, and methods (like functions) are not first-class values.",
      formal: `Γ ⊢ e.${name} only in e.${name}(…) position ⇒ error`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  noMethod(t: OrbType, name: string): Explanation {
    return {
      what: `Type error: ${ty(t)} has no method ${name}().`,
      why: "The receiver's type is known here, so its method table is known too — and this name is not in it.",
      formal: `Γ ⊢ e : ${ty(t)}, ${name} ∉ methods(${ty(t)}) ⇒ type error`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  methodArity(t: OrbType, name: string, want: number, got: number): Explanation {
    return {
      what: `Arity error: ${ty(t)}.${name}() takes ${want} argument(s), got ${got}.`,
      why: "A method's parameter count is fixed by its signature, exactly like a function's.",
      formal: `${name} : ${want} param(s), |args| = ${got} ≠ ${want} ⇒ arity error`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  methodArg(t: OrbType, name: string, want: OrbType, got: OrbType): Explanation {
    return {
      what: `Type error: ${ty(t)}.${name}() expects ${ty(want)}, got ${ty(got)}.`,
      why: "The collection's type parameter fixes what it may hold; adding another type would break every later lookup.",
      formal: `Γ ⊢ arg : ${ty(got)}, ${name} needs ${ty(want)} ⇒ type error`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  method(t: OrbType, name: string, args: OrbType[], res: OrbType): Explanation {
    return {
      what: `Checked ${ty(t)}.${name}(${args.map(ty).join(", ")}): result ${ty(res)}.`,
      why: "The receiver's static type selects the method table; its signature types the arguments and the result.",
      formal: `Γ ⊢ e : ${ty(t)}, ${name} ∈ methods ⇒ Γ ⊢ e.${name}(…) : ${ty(res)}`,
      next: "Return this type to the enclosing expression.",
    };
  },

  methodUnknown(name: string, argc: number): Explanation {
    return {
      what: `Receiver type unknown: .${name}() with ${argc} argument(s) is left for the VM to look up.`,
      why: WHY_RICE,
      formal: `Γ ⊢ e : unknown ⇒ Γ ⊢ e.${name}(…) : unknown   (checked at run time)`,
      next: "Return unknown to the enclosing expression.",
    };
  },

  notIterable(t: OrbType): Explanation {
    return {
      what: `Type error: cannot loop over ${ty(t)}.`,
      why: "for-each needs a sequence of items: a coil, scale, clutch, den (its keys) or string (its characters).",
      formal: `Γ ⊢ e : ${ty(t)}, no rule iter(${ty(t)}) ⇒ type error`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  forEach(name: string, t: OrbType, el: OrbType): Explanation {
    return {
      what: `for ${name} in ${ty(t)}: ${name} takes each ${t.kind === "den" ? "key" : "item"}, type ${ty(el)}.`,
      why: "The loop variable gets the iterable's element type, and lives only in the loop's own scope.",
      formal: `Γ ⊢ e : ${ty(t)}, iter(${ty(t)}) = ${ty(el)} ⇒ Γ, ${name} : ${ty(el)} ⊢ body`,
      next: `Declare ${name}, then check the loop body.`,
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

  condition(stmt: Stmt, t: OrbType): Explanation {
    const ok = t.kind === "bool" || t.kind === "unknown";
    const w = stmtWord[stmt.kind];
    return {
      what: ok ? `The ${w} condition has type ${ty(t)} — accepted.` : `Type error: the ${w} condition has type ${ty(t)}, not bool.`,
      why: ok ? (t.kind === "unknown" ? WHY_RICE : "Branching needs a truth value; Ouroboros has no truthiness, so conditions must be bool.") : "Ouroboros has no truthiness: a branch decision needs a bool, and there is no rule turning an int into one.",
      formal: ok ? `Γ ⊢ cond : ${ty(t)} ⇒ ${w} well-typed (cond : bool)` : `Γ ⊢ cond : ${ty(t)}, rule needs cond : bool ⇒ type error`,
      next: ok ? "Check the body." : "Compilation stops; later phases are blocked.",
    };
  },

  assign(target: Expr, tt: OrbType, vt: OrbType, ok: boolean): Explanation {
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
      why: "Ouroboros functions are not first-class: a function name may only appear as the callee of a call.",
      formal: `Γ ⊢ ${name} : fn(n) only in ${name}(…) position ⇒ error`,
      next: "Compilation stops; later phases are blocked.",
    };
  },

  notCallable(what: string, t: OrbType | null): Explanation {
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
      why: "Strings are immutable and not indexable in Ouroboros; only array<T> elements are lvalues.",
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
