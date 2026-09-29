// Hover definitions for ToC / compiler vocabulary. ExplanationGrid scans
// every explanation cell for these terms (case-insensitive, whole word) and
// underlines them, so a term defined here is linked everywhere it's used.
// `aliases` are alternative spellings that should show the same definition.

export interface GlossaryEntry {
  term: string;
  aliases?: string[];
  def: string;
  // Only link exact-case matches — for terms that are also ordinary English
  // words ("DEAD" the state vs. "dead" in prose).
  caseSensitive?: boolean;
}

export const GLOSSARY: GlossaryEntry[] = [
  { term: "DFA", aliases: ["deterministic finite automaton"], def: "Deterministic finite automaton: a 5-tuple (Q, Σ, δ, q₀, F) with exactly one next state for every (state, symbol) pair; recognizes exactly the regular languages." },
  { term: "NFA", aliases: ["nondeterministic finite automaton"], def: "Nondeterministic finite automaton: like a DFA but δ may give several (or zero) next states; the subset construction converts any NFA into an equivalent DFA." },
  { term: "ε-transition", aliases: ["ε-move", "ε-moves", "epsilon transition", "ε-NFA"], def: "A move that changes state without reading an input symbol; allowed in an ε-NFA, never in a DFA." },
  { term: "alphabet", aliases: ["Σ"], def: "Σ, the finite set of input symbols an automaton reads; here, character classes such as letter, digit and operator." },
  { term: "δ", aliases: ["transition function", "delta function"], def: "The transition function δ: Q × Σ → Q, which says which state the machine moves to on each input symbol." },
  { term: "accepting state", aliases: ["accepting states", "final state"], def: "A state in F; if the automaton stops there, the input read so far is in the language (here: a complete token)." },
  { term: "DEAD", aliases: ["trap state"], caseSensitive: true, def: "A non-accepting state with a self-loop on every symbol; once entered, no input can lead to acceptance. It makes δ total." },
  { term: "longest match", aliases: ["maximal munch"], def: "Scanner rule: keep running the DFA as long as possible and emit the longest prefix that ended in an accepting state." },
  { term: "lookahead", def: "The next unread input symbol (or token), inspected without consuming it to decide which move or production to take." },
  { term: "token", aliases: ["tokens"], def: "A classified unit of input, a (kind, lexeme) pair such as (NUMBER, \"42\"), produced by the lexer for the parser." },
  { term: "lexeme", def: "The exact substring of source text that matched a token's pattern." },
  { term: "context-free grammar", aliases: ["CFG"], def: "A 4-tuple (V, Σ, R, S) whose productions have a single non-terminal on the left; generates exactly the languages PDAs recognize." },
  { term: "BNF", aliases: ["Backus–Naur form"], def: "Backus–Naur form: grammar notation of plain productions, A ::= α | β, with no repetition operators." },
  { term: "EBNF", def: "Extended BNF: adds *, + and ? shorthand; each can be rewritten into plain BNF with helper non-terminals." },
  { term: "production", aliases: ["productions"], def: "A grammar rule A → α saying non-terminal A may be replaced by the string α." },
  { term: "non-terminal", aliases: ["non-terminals", "nonterminal"], def: "A grammar variable (like Statement) that productions rewrite; it never appears in the final token string." },
  { term: "terminal", aliases: ["terminals"], def: "A symbol of the input alphabet (a token kind) that productions cannot rewrite further." },
  { term: "derivation", aliases: ["leftmost derivation"], def: "A sequence of production applications from the start symbol to the input; leftmost expands the leftmost non-terminal each time." },
  { term: "parse tree", def: "A tree recording a derivation: interior nodes are non-terminals, their children are the right-hand side of the production used." },
  { term: "AST", aliases: ["abstract syntax tree"], def: "Abstract syntax tree: the parse tree with grammar-only nodes (parentheses, helper non-terminals) removed, keeping just the program's structure." },
  { term: "PDA", aliases: ["pushdown automaton"], def: "Pushdown automaton: a finite automaton plus one unbounded stack; recognizes exactly the context-free languages." },
  { term: "LL(1)", def: "A grammar parseable top-down, Left-to-right, building a Leftmost derivation with 1 token of lookahead: each table cell holds at most one production." },
  { term: "FIRST set", aliases: ["FIRST sets"], def: "FIRST(α): the set of terminals that can begin a string derived from α; LL(1) picks a production by checking the lookahead against it." },
  { term: "FOLLOW set", aliases: ["FOLLOW sets"], def: "FOLLOW(A): the terminals that can appear right after A in some derivation; used when A can derive ε." },
  { term: "left-factoring", aliases: ["left factoring"], def: "Rewriting A → αβ | αγ into A → αA′, A′ → β | γ so one token of lookahead suffices to choose." },
  { term: "pumping lemma", def: "A property every regular (or context-free) language has; showing a language lacks it proves the language is not in that class." },
  { term: "symbol table", def: "A map from names to what they denote (type, kind, scope), filled at declarations and consulted at every use." },
  { term: "scope", aliases: ["scopes"], def: "The region of the program where a declaration is visible; nested blocks push a new scope and pop it on exit." },
  { term: "type", aliases: ["types"], def: "A set of values plus the operations valid on them; type checking rejects operations applied to the wrong set." },
  { term: "syntax-directed translation", def: "Producing output by attaching a translation rule to each production and applying it while walking the tree." },
  { term: "backpatching", def: "Emitting a jump before its target is known, then filling in the target address once the label is reached." },
  { term: "basic block", aliases: ["basic blocks"], def: "A maximal straight-line run of instructions: entered only at the first, left only at the last." },
  { term: "leader", aliases: ["leaders"], def: "The first instruction of a basic block: the program start, any jump target, or the instruction right after a jump." },
  { term: "control-flow graph", def: "A directed graph whose nodes are basic blocks and whose edges are the possible jumps and fall-throughs between them." },
  { term: "constant folding", def: "Evaluating an expression whose operands are all known at compile time and replacing it with the result." },
  { term: "dead code", aliases: ["unreachable code"], def: "Code no execution can reach (no path from the entry block); removing it cannot change the program's behaviour." },
  { term: "fixpoint", aliases: ["fixed point"], def: "The state where applying the rewrite rules once more changes nothing; the optimizer iterates until it gets there." },
  { term: "Rice's theorem", def: "Every non-trivial property of what a program computes is undecidable, so optimizers can only use safe approximations." },
  { term: "halting problem", def: "Deciding whether an arbitrary program halts on its input; Turing proved no algorithm can do it for all programs." },
  { term: "heap", def: "Memory for values that outlive one instruction (coils, dens, …); the stack and variables only hold references to them." },
  { term: "hashed", aliases: ["hash", "hashing"], def: "Turning a value into a key that picks its bucket directly, so a den or clutch finds an item without scanning; only immutable values can be hashed safely." },
  { term: "iterator", def: "An object that remembers a position in a sequence and hands out the next item on request; for-each loops run on one." },
  { term: "dynamic dispatch", def: "Choosing which method body runs from the object's run-time class, walking its class chain; the compiler cannot know it in general." },
  { term: "static dispatch", def: "The called method is fixed at compile time (here: super.m()), so the VM does no lookup." },
  { term: "inheritance", aliases: ["inherits"], def: "A class reusing another class's fields and methods; a subclass may override methods and field defaults." },
  { term: "encapsulation", aliases: ["private"], def: "Hiding an object's state behind its class's methods (priv), so it can only change in the ways the class allows." },
  { term: "abstract", def: "A class that cannot be instantiated, or a method with no body; concrete subclasses must supply every abstract method." },
  { term: "overloads", aliases: ["overload", "overloading"], def: "Several functions sharing one name, told apart here by parameter count; each call picks the one with a matching arity." },
  { term: "name mangling", def: "Encoding extra information (here the parameter count) into a generated name, e.g. add/2, so overloads get distinct code objects." },
  { term: "Turing machine", def: "A finite control with an unbounded read/write tape; the standard model of what is computable." },
  { term: "universal machine", aliases: ["universal Turing machine"], def: "A Turing machine that takes another machine's description as input and simulates it, as an interpreter or VM does." },
  { term: "decidable", aliases: ["undecidable"], def: "A problem is decidable if some algorithm always halts with the correct yes/no answer; undecidable if none can." },
  { term: "bytecode", def: "A compact instruction encoding for a virtual machine rather than real hardware: opcodes plus operands stored as bytes." },
  { term: "wordcode", def: "Bytecode where every instruction is exactly two bytes (opcode, argument), the layout CPython has used since 3.6." },
  { term: "VM", aliases: ["virtual machine", "stack VM", "stack machine"], def: "Virtual machine: a program that executes bytecode by fetch-decode-execute over an operand stack and call frames." },
  { term: "operand stack", def: "The VM's working stack: instructions pop their inputs from it and push their result back on it." },
];
