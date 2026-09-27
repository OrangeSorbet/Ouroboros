#!/usr/bin/env python3
"""Builds docs/Ouroboros_TOC_Endsem.pptx with officecli (morph deck).

Run from anywhere:  python docs/ppt-build/build.py   (close the deck in PowerPoint first)
Plan + morph choreography: docs/ppt-build/brief.md
"""
import json, math, os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "Ouroboros_TOC_Endsem.pptx"))
OFFICECLI = shutil.which("officecli") or os.path.expandvars(r"%LOCALAPPDATA%\OfficeCLI\officecli.exe")

# Green-on-black terminal palette.
BG = "000000-03150A-062A12-135"
PRI, SEC, TEAL, AMB = "00FF88", "0B8F45", "5EEAD4", "FBBF24"
WHITE, SOFT, DIM, DIMLINE, INK = "FFFFFF", "D1FAE5", "03200E", "34D399", "00140A"
BRIGHT = {PRI, TEAL, AMB}  # fills that need dark text
HEAD, BODY, MONO = "Arial Black", "Segoe UI", "Consolas"
CLASS_COLOR = {1: PRI, 2: TEAL, 3: SEC, 4: SEC, 5: SEC, 6: SEC, 7: AMB}


def cm(v):
    return f"{v:.2f}cm"


def cli(*args, check=True):
    r = subprocess.run([OFFICECLI, *args], capture_output=True, text=True, encoding="utf-8")
    if check and r.returncode != 0:
        sys.exit(f"officecli {' '.join(args)} failed:\n{r.stdout}\n{r.stderr}")
    return r.stdout


class Slide:
    def __init__(self, n, morph=True):
        self.n, self.ops, self.dx, self.dy = n, [], 0.0, 0.0
        props = {"layout": "blank", "background": BG}
        if morph:
            props["transition"] = "morph"
        self.ops.append({"command": "add", "parent": "/", "type": "slide", "props": props})

    def shape(self, name, **props):
        if name.startswith("#"):  # content shapes follow the current diagram offset
            props["x"] = props["x"] + self.dx
            props["y"] = props["y"] + self.dy
        p = {"name": name, "line": "none"}
        p.update({k: (cm(v) if k in ("x", "y", "width", "height") else str(v)) for k, v in props.items()})
        self.ops.append({"command": "add", "parent": f"/slide[{self.n}]", "type": "shape", "props": p})

    def text(self, name, txt, x, y, w, h, size, font=BODY, color=WHITE, bold=False, align="left", valign="middle", **extra):
        self.shape(name, text=txt, x=x, y=y, width=w, height=h, size=size, font=font, color=color,
                   bold=str(bold).lower(), align=align, fill="none", valign=valign, **extra)

    def bullets(self, name, items, x, y, w, h, size=18, color=SOFT):
        self.text(name, "\n".join("▸  " + i for i in items), x, y, w, h, size, color=color, valign="top", spaceAfter="6pt")

    def box(self, name, txt, x, y, w, h, fill, size=18, font=BODY, color=None, line=None, opacity=None, bold=False, align="center", valign="middle"):
        extra = {"opacity": opacity} if opacity is not None else {}
        if color is None:
            color = INK if fill in BRIGHT else WHITE
        self.shape(name, preset="roundRect", text=txt, x=x, y=y, width=w, height=h, fill=fill, size=size,
                   font=font, color=color, bold=str(bold).lower(), align=align, valign=valign,
                   **({"line": line} if line else {}), **extra)

    def arrow(self, a, b, color=SOFT, dash=None):
        # Morph slides store every name with a "!!" prefix; connectors look it up verbatim.
        ref = lambda nm: nm if nm.startswith("!!") else "!!" + nm
        p = {"shape": "straight", "from": f"/slide[{self.n}]/shape[@name={ref(a)}]",
             "to": f"/slide[{self.n}]/shape[@name={ref(b)}]", "color": color, "lineWidth": "2pt", "tailEnd": "triangle"}
        if dash:
            p["lineDash"] = dash
        self.ops.append({"command": "add", "parent": f"/slide[{self.n}]", "type": "connector", "props": p})

    def notes(self, txt):
        self.ops.append({"command": "set", "path": f"/slide[{self.n}]", "props": {"notes": txt}})

    # --- scene actors (on every slide, paired by name) ------------------------
    def orbs(self):
        o1, o2 = ORB_PATTERNS[(self.n - 1) % len(ORB_PATTERNS)]
        self.shape("!!scene-orb1", preset="ellipse", x=o1[0], y=o1[1], width=15, height=15, fill=PRI, opacity=0.16, softEdge=60)
        self.shape("!!scene-orb2", preset="ellipse", x=o2[0], y=o2[1], width=11, height=11, fill=TEAL, opacity=0.12, softEdge=50)

    def ring(self, cx, cy, r, rot, gap=30, thick=6000):
        # The snake: a block arc whose centre line has radius r, with a `gap`°
        # opening (its mouth) centred at `rot`° clockwise from 3 o'clock.
        d = 2 * r / (1 - thick / 100000)
        st, end = (rot + gap / 2) % 360, (rot - gap / 2) % 360
        adj = f"adj1:val {int(st * 60000)},adj2:val {int(end * 60000)},adj3:val {thick}"
        self.shape("!!scene-ring", preset="blockArc", x=cx - d / 2, y=cy - d / 2, width=d, height=d,
                   gradient=f"{PRI}-{SEC}-45", glow=PRI, adj=adj)

    def circle(self, i, cx, cy, d, style, size):
        p = dict(preset="ellipse", x=cx - d / 2, y=cy - d / 2, width=d, height=d, text=str(i), size=size,
                 font=HEAD, color=INK, align="center", valign="middle", margin=0)
        if style == "hero":
            p.update(gradient=f"{PRI}-{SEC}-45", glow=PRI)
        elif style == "lit":
            p.update(gradient=f"{PRI}-{SEC}-45")
        elif style == "done":
            p.update(fill=PRI)
        elif style == "todo":
            p.update(fill=DIM, line=f"{DIMLINE}:1.5", color=WHITE)
        else:  # a class colour
            p.update(fill=style)
        self.shape(f"!!scene-p{i}", **p)

    def ring_of_circles(self, cx, cy, r, d, size, style):
        for i in range(1, 8):
            a = math.radians(-90 + (i - 1) * 360 / 7)
            self.circle(i, cx + r * math.cos(a), cy + r * math.sin(a), d, style, size)

    def row_of_circles(self, x0, y, pitch, d, size, style_of, skip=None):
        for i in range(1, 8):
            if i != skip:
                self.circle(i, x0 + (i - 1) * pitch, y, d, style_of(i), size)


ORB_PATTERNS = [((18, -3), (-3, 11)), ((22, 8), (2, -4)), ((-4, 8), (24, -3)), ((-5, 9), (26, 12)),
                ((22, -4), (-3, 10)), ((10, 9), (27, -3)), ((26, 6), (4, 12))]


def std_header(s, kicker, title):
    s.text(f"#s{s.n}-kicker", kicker, 1.6, 0.7, 20, 1.1, 18, color=TEAL, bold=True)
    s.text(f"#s{s.n}-title", title, 1.6, 1.6, 30, 2.4, 40, font=HEAD)


# --- phase slides ------------------------------------------------------------

def phase_slide(n, k, kicker, title, items, diagram, action=False):
    """Hero = phase k on the left, progress strip top-right, content right."""
    s = Slide(n)
    s.orbs()
    if action:
        s.ring(5.3, 11.0, 3.7, (230 + 45 * n) % 360)
        s.circle(k, 5.3, 11.0, 6.0, "hero", 80)
    else:
        s.ring(5.3, 8.6, 4.5, (200 + 45 * n) % 360)
        s.circle(k, 5.3, 8.6, 7.4, "hero", 96)
    s.row_of_circles(22.6, 1.1, 1.5, 1.0, 11, lambda i: "done" if i < k else "todo", skip=k)
    p = f"#s{n}"
    s.text(f"{p}-kicker", kicker, 11.2, 0.6, 10.8, 1.1, 18, color=TEAL, bold=True)
    s.text(f"{p}-title", title, 11.2, 1.7, 21, 2.3, 40, font=HEAD)
    s.bullets(f"{p}-pts", items, 11.2, 3.9, 21.2, 5.9)
    if action:
        diagram(s, p)
    else:
        s.dx, s.dy = -2.4, 1.5
        diagram(s, p)
        s.dx = s.dy = 0.0
    s.notes(NOTES[n])
    return s


# Theory diagrams (drawn for content area x 13.6–32.3, y 8.6–16.8; shifted by dx/dy).

def d_lex(s, p):
    s.shape(f"{p}-start", preset="ellipse", text="q0", x=13.8, y=9.4, width=2.8, height=2.8, fill=DIM, line=f"{TEAL}:2", size=18, font=BODY, color=WHITE, bold="true", align="center", valign="middle")
    for name, label, y in (("ident", "ID", 8.2), ("num", "NUM", 11.7)):
        s.shape(f"{p}-{name}o", preset="ellipse", x=20.2, y=y, width=2.8, height=2.8, fill="none", line=f"{PRI}:2")
        s.shape(f"{p}-{name}", preset="ellipse", text=label, x=20.5, y=y + 0.3, width=2.2, height=2.2, fill=PRI, size=16, font=BODY, color=INK, bold="true", align="center", valign="middle", margin=0)
    s.shape(f"{p}-dead", preset="ellipse", text="DEAD", x=27.4, y=11.7, width=2.8, height=2.8, fill="2A2A2A", size=14, font=BODY, color=WHITE, bold="true", align="center", valign="middle")
    s.arrow(f"{p}-start", f"{p}-idento", TEAL)
    s.arrow(f"{p}-start", f"{p}-numo", TEAL)
    s.arrow(f"{p}-numo", f"{p}-dead", AMB)
    s.text(f"{p}-l1", "letter", 16.3, 8.2, 3.5, 1.0, 16, color=TEAL)
    s.text(f"{p}-l2", "digit", 16.3, 12.9, 3.5, 1.0, 16, color=TEAL)
    s.text(f"{p}-l3", "letter → 123abc ✗", 23.4, 10.3, 8.5, 1.0, 16, color=AMB)
    s.text(f"{p}-l4", "◎ = accepting state (F)", 13.8, 14.9, 9, 1.0, 16, color=SOFT)


def d_parse(s, p):
    for i, (label, top) in enumerate((("Program", False), ("Decl*", False), ("Statement", False), ("LetStmt", True))):
        s.box(f"{p}-st{i}", label, 13.8, 14.4 - i * 1.45, 5.6, 1.25, PRI if top else DIM, size=16, font=MONO, line=f"{DIMLINE}:1")
    s.text(f"{p}-stl", "stack (top ↑)", 13.8, 15.8, 5.6, 1.0, 16, color=SOFT)
    cols = ["M[A, t]", "let", "print"]
    rows = [("Statement", "LetStmt", "PrintStmt"), ("Decl", "Statement", "Statement")]
    for j, h in enumerate(cols):
        s.box(f"{p}-h{j}", h, 20.6 + j * 3.8, 9.0, 3.6, 1.3, "0A3A1E", size=16, font=MONO)
    for r, row in enumerate(rows):
        for j, cell in enumerate(row):
            hot = r == 0 and j == 1
            s.box(f"{p}-c{r}{j}", cell, 20.6 + j * 3.8, 10.5 + r * 1.5, 3.6, 1.3, PRI if hot else DIM, size=14, font=MONO, line=f"{DIMLINE}:1")
    s.text(f"{p}-tl", "one entry per cell ⇒ deterministic", 20.6, 13.6, 11.6, 1.4, 16, color=SOFT)


def d_sem(s, p):
    s.shape(f"{p}-g", preset="roundRect", x=13.8, y=8.8, width=18.4, height=7.0, fill="none", line=f"{TEAL}:2")
    s.text(f"{p}-gl", "global scope", 14.2, 9.0, 8, 1.1, 16, color=TEAL, bold=True)
    for i, chip in enumerate(("square : fn(1)", "limit : int", "total : int")):
        s.box(f"{p}-gc{i}", chip, 14.3, 10.3 + i * 1.7, 6.6, 1.3, DIM, size=16, font=MONO, line=f"{PRI}:1")
    s.shape(f"{p}-f", preset="roundRect", x=22.0, y=10.4, width=9.6, height=4.8, fill="none", line=f"{PRI}:2")
    s.text(f"{p}-fl", "fn square", 22.4, 10.6, 6, 1.1, 16, color=PRI, bold=True)
    s.box(f"{p}-fc", "n : unknown", 22.5, 12.2, 6.6, 1.3, DIM, size=16, font=MONO, line=f"{AMB}:1")
    s.text(f"{p}-fn", "checked at run time (Rice)", 22.4, 13.5, 9, 1.6, 14, color=AMB)


def d_ir(s, p):
    s.shape(f"{p}-plus", preset="ellipse", text="+", x=15.5, y=9.0, width=2.0, height=2.0, fill=PRI, size=24, font=HEAD, color=INK, align="center", valign="middle")
    for name, t, x in ((f"{p}-one", "1", 13.9), (f"{p}-two", "2", 17.3)):
        s.shape(name, preset="ellipse", text=t, x=x, y=12.6, width=1.8, height=1.8, fill=DIM, line=f"{TEAL}:1.5", size=18, font=HEAD, color=WHITE, align="center", valign="middle")
    s.arrow(f"{p}-plus", f"{p}-one")
    s.arrow(f"{p}-plus", f"{p}-two")
    for i, ins in enumerate(("LOAD_CONST  1", "LOAD_CONST  2", "BINARY_OP   +", "STORE_FAST  limit")):
        s.box(f"{p}-i{i}", ins, 21.4, 8.9 + i * 1.65, 10.6, 1.35, PRI if i == 2 else DIM, size=18, font=MONO, line=f"{DIMLINE}:1", align="left")
    s.text(f"{p}-cap", "children first, then the node", 13.6, 14.8, 7.5, 1.7, 14, color=SOFT)


def d_opt(s, p):
    s.box(f"{p}-b0", "B0   limit = 3", 13.8, 8.9, 8.0, 1.8, DIM, size=18, font=MONO, line=f"{TEAL}:2", align="left")
    s.box(f"{p}-b1", "B1   print names[1]", 13.8, 13.6, 8.0, 1.8, DIM, size=18, font=MONO, line=f"{TEAL}:2", align="left")
    s.box(f"{p}-b2", 'B2   print "never"', 24.0, 11.3, 8.2, 1.8, "2A2A2A", size=18, font=MONO, line=f"{AMB}:2:dash", align="left")
    s.arrow(f"{p}-b0", f"{p}-b1", TEAL)
    s.arrow(f"{p}-b0", f"{p}-b2", AMB, dash="dash")
    s.text(f"{p}-dead", "no path → removed", 24.0, 13.3, 8.2, 1.1, 16, color=AMB, bold=True)
    s.box(f"{p}-fold", "1 + 2   ⟶   3", 24.0, 8.9, 8.2, 1.5, PRI, size=18, font=MONO, bold=True)


def d_bc(s, p):
    s.text(f"{p}-ins", "POP_JUMP_IF_FALSE   L_else", 13.8, 8.8, 18, 1.4, 22, font=MONO, color=WHITE, bold=True)
    s.text(f"{p}-off", "↓   L_else is 3 instructions ahead  →  +3", 13.8, 10.3, 18, 1.3, 18, color=TEAL)
    for i, b in enumerate(("20", "00", "2C", "03", "06", "00", "05", "00")):
        hot = i in (2, 3)
        s.box(f"{p}-by{i}", b, 13.8 + i * 2.3, 12.2, 2.0, 2.0, PRI if hot else DIM, size=20, font=MONO, line=f"{DIMLINE}:1", bold=hot)
    s.text(f"{p}-cap", "opcode · arg   —   2 bytes per instruction", 13.8, 14.8, 18, 1.2, 16, color=SOFT)


def d_vm(s, p):
    for i, v in enumerate(('"hi"', "[…]", "3")):
        s.box(f"{p}-os{i}", v, 13.8, 13.3 - i * 1.5, 5.2, 1.3, PRI if i == 0 else DIM, size=16, font=MONO, line=f"{DIMLINE}:1")
    for i, v in enumerate(("<main>", "square")):
        s.box(f"{p}-fr{i}", v, 20.0, 13.3 - i * 1.5, 5.2, 1.3, TEAL if i == 1 else DIM, size=16, font=MONO, line=f"{DIMLINE}:1")
    s.box(f"{p}-con", "> hi", 26.2, 10.3, 6.0, 4.3, "000000", size=22, font=MONO, color=SOFT, line=f"{DIMLINE}:1", align="left")
    s.text(f"{p}-l1", "operand stack", 13.8, 14.8, 5.4, 1.1, 16, color=SOFT)
    s.text(f"{p}-l2", "call frames", 20.0, 14.8, 5.4, 1.1, 16, color=SOFT)
    s.text(f"{p}-l3", "console", 26.2, 14.8, 5.4, 1.1, 16, color=SOFT)


# Action diagrams (absolute coordinates, content area x 11.2–32.3, y 9.6–17.8).

def d_lex_action(s, p):
    for i, ch in enumerate("if (x <= 3)"):
        hot = i in (6, 7)
        s.box(f"{p}-t{i}", ch if ch != " " else "␣", 11.4 + i * 1.4, 9.7, 1.25, 1.25, PRI if hot else DIM, size=18, font=MONO, line=f"{DIMLINE}:1", bold=hot)
    s.text(f"{p}-lm", "longest match: '<' can still move on '=', so '<=' is ONE token", 11.2, 11.1, 21, 1.2, 16, color=TEAL)
    x = 11.4
    for i, tok in enumerate(("IF", "(", "IDENT x", "LE", "NUMBER 3", ")")):
        w = 1.2 + 0.42 * len(tok)
        s.box(f"{p}-k{i}", tok, x, 12.5, w, 1.2, PRI if tok == "LE" else DIM, size=16, font=MONO, line=f"{DIMLINE}:1")
        x += w + 0.3
    s.box(f"{p}-err", "123abc", 11.4, 14.4, 3.6, 1.3, DIM, size=18, font=MONO, line=f"{AMB}:2")
    s.text(f"{p}-errl", "→ BAD_NUMBER: digits ran into letters", 15.3, 14.4, 17, 1.3, 16, color=AMB)
    s.text(f"{p}-stat", "demo.snek: 94 tokens in 700 DFA steps, every one replayable", 11.2, 16.2, 21, 1.1, 16, color=SOFT)


def d_parse_action(s, p):
    s.text(f"{p}-der", "Statement  ⇒  LetStmt  ⇒  let IDENT = Expr ;", 11.2, 9.4, 21, 1.2, 18, font=MONO, color=PRI)
    cols = (("before", ["Decl*", "LetStmt"]), ("expand LetStmt", [";", "Expr", "=", "IDENT", "let"]), ("match 'let'", [";", "Expr", "=", "IDENT"]))
    for c, (label, items) in enumerate(cols):
        x = 11.4 + c * 7.1
        for i, it in enumerate(items):
            top = i == len(items) - 1
            s.box(f"{p}-c{c}i{i}", it, x, 15.6 - (i + 1) * 1.0, 5.0, 0.92, PRI if top else DIM, size=16, font=MONO, line=f"{DIMLINE}:1")
        s.text(f"{p}-c{c}l", label, x, 15.8, 5.0, 1.0, 16, color=SOFT, align="center")
        if c < 2:
            s.text(f"{p}-ar{c}", "→", x + 5.1, 12.2, 1.8, 1.8, 28, font=HEAD, color=PRI, align="center")
    s.text(f"{p}-stat", "demo.snek: 559 PDA moves · accept = input consumed and stack empty", 11.2, 16.9, 21, 1.0, 16, color=SOFT)


PHASE_SLIDES = [
    # (slide, phase, kicker, title, bullets, diagram, action)
    (7, 1, "PHASE 1 · DFA", "Lexical Analysis", [
        "M = (Q, Σ, δ, q₀, F) is stored as data — the screen draws the real automaton",
        "Σ = character classes (letter, digit, <, =, \" …); δ is total: bad input → DEAD trap",
        "No ε-moves: “emit a token and restart” is the scanner's action, not an edge",
    ], d_lex, False),
    (8, 1, "PHASE 1 · IN ACTION", "Scanning the Input", [
        "Maximal munch: keep moving while δ allows, back up to the last accepting state",
        "Keywords: accept an identifier, then look it up in the keyword table",
    ], d_lex_action, True),
    (9, 2, "PHASE 2 · CFG → PDA", "Syntax Analysis", [
        "G = (V, T, P, S) in pure BNF — one source of truth for parser and screen",
        "Left-factored, no left recursion; FIRST / FOLLOW computed by fixpoint",
        "LL(1) table M[A, t]: at most one production per cell ⇒ a deterministic PDA",
    ], d_parse, False),
    (10, 2, "PHASE 2 · IN ACTION", "The PDA at Work", [
        "expand A → α: pop A, push α reversed   ·   match t: pop t, read t",
        "Leftmost derivation shown live; parse tree folded into the AST",
    ], d_parse_action, True),
    (11, 3, "PHASE 3 · SYMBOL TABLE", "Semantic Analysis", [
        "“Declared before use” is like {wcw} — not context-free (pumping lemma)",
        "Hoist pass, then a scope-stack walk: every name → slot, every expression → type",
        "Exact typing is undecidable (Rice): unknown types are checked at run time",
    ], d_sem, False),
    (12, 4, "PHASE 4 · TRANSLATION", "IR Generation", [
        "One translation rule per AST node, applied in post-order",
        "Operands are pushed before the operator — exactly what a stack machine needs",
        "for → while desugaring; forward jumps emitted as “?” and backpatched",
    ], d_ir, False),
    (13, 5, "PHASE 5 · FLOW GRAPH", "Optimization", [
        "Leaders → basic blocks → edges; rewrite rules run to a fixpoint",
        "Constant folding, propagation, branch folding, dead-code removal, peephole",
        "Rice's theorem: only provably dead code (no path) goes — 47 → 40 instructions",
    ], d_opt, False),
    (14, 6, "PHASE 6 · WORDCODE", "Bytecode Emission", [
        "Every instruction = 2 bytes (opcode, argument), like CPython 3.12",
        "Labels → relative jumps; EXTENDED_ARG sizes settle at a fixpoint",
        "co_consts, co_names, co_varnames + a line table; a dis-style listing",
    ], d_bc, False),
    (15, 7, "PHASE 7 · UNIVERSAL MACHINE", "Execution (VM)", [
        "Fetch–decode–execute over raw bytes: the program is data it interprets",
        "Two stacks + unbounded integers ⇒ Turing-complete ⇒ halting is undecidable",
        "So the VM runs on a budget: 10 000 steps, 256 frames — then explains why",
    ], d_vm, False),
]

NOTES = {
    2: "Compilers are the most widely used application of automata theory, yet students usually only see the input and the output. Ouroboros opens the box. We designed a small language, Snek, built a complete compiler for it, and recorded every step every phase takes, so it can be replayed like a video with an explanation for each step.",
    3: "Our four objectives: show each ToC machine running on real input rather than on a whiteboard; build a complete seven-phase compiler that mirrors CPython; make every step explain itself in four parts (what, why, the formal rule, and what comes next); and show the limits of computation live, not just state them.",
    4: "This is the theory spine of the project. The Chomsky hierarchy orders language classes by the machine needed to recognise them. Each compiler phase uses the weakest machine that can do its job, and each machine's limit is exactly why the next phase exists: a DFA cannot count brackets, a PDA cannot check declarations, and a Turing-complete machine cannot decide whether a program halts.",
    5: "Where does ToC actually live in a compiler? Phases 1 and 2 are pure automata theory: regular languages and DFAs, context-free grammars and PDAs. That is where most of the ToC in this project is concentrated, and why they get two slides each. Phases 3, 5 and 7 apply ToC's limits: non-context-free languages, Rice's theorem and the halting problem. Phases 4 and 6 are translation, with little theory in them.",
    6: "The pipeline. Each phase consumes only the previous phase's output. Source text becomes tokens, tokens become an abstract syntax tree, the tree is checked and typed, translated to stack instructions, optimised on a control-flow graph, packed into bytecode and finally executed. If any phase fails, the pipeline stops there and the error step explains which rule was broken.",
    7: "The lexer is a real DFA, defined as a five-tuple in code and drawn from that same data. The alphabet is character classes rather than raw characters. The transition function is total: every state has an edge for every class, and anything invalid falls into a DEAD trap state. There are no epsilon moves; accepting a token and restarting is the scanner's action, not an edge of the automaton.",
    8: "How the DFA is used: maximal munch. The scanner keeps moving while the transition function allows, remembers the last accepting state, and backs up to it when the next move would be DEAD. That is why less-than-or-equal is one token. Keywords are identifiers looked up in a table. A number running into letters, 123abc, is rejected as BAD_NUMBER, just as real compilers reject an invalid suffix.",
    9: "The grammar is data, in pure BNF, and everything is derived from it. We left-factored it and removed left recursion so it is LL(1). FIRST and FOLLOW sets are computed by fixpoint iteration and produce the parse table. Every cell holds at most one production, which is exactly the condition for the PDA to be deterministic. Our self-check confirms there are zero conflicts.",
    10: "The PDA built from a grammar has one state; all the work happens on the stack. Expand: pop a non-terminal and push the production chosen by the table, reversed. Match: pop a terminal equal to the next input token. The input is accepted when it is consumed and the stack is empty. The app shows the stack, the leftmost derivation and the table cell used, then folds the parse tree into an AST.",
    11: "Is x declared before it is used? That is the language w c w, and the pumping lemma shows it is not context-free, so no PDA can check it. Semantic analysis walks the AST with a stack of scopes, the symbol table. Exact type checking is undecidable by Rice's theorem, so parameters stay unknown and the VM checks them at run time.",
    12: "Now we translate rather than recognise. Each AST node kind has one translation rule. Applied in post-order, children are compiled before their parent, so operands are on the stack before the operator pops them. For loops are desugared into while loops, and forward jumps are emitted with a placeholder and backpatched once their label is placed.",
    13: "The instructions are cut into basic blocks at leaders and joined by edges: the control-flow graph. Rewrite rules then run until nothing changes, a fixpoint. Rice's theorem says deciding whether code is really dead is impossible in general, so we only remove blocks with no path from the entry, which is decidable by graph search. On the demo, the main code object goes from 47 to 40 instructions with the same output; 1 / 0 is never folded.",
    14: "The assembler packs each instruction into two bytes, opcode and argument, like CPython's wordcode. Labels become relative jump offsets. Arguments above 255 need EXTENDED_ARG prefixes, which can lengthen jumps and push other targets further, so sizes are recomputed until nothing grows: another fixpoint. The app shows a dis-style listing with the raw bytes.",
    15: "The VM fetches the opcode at the program counter, decodes it and executes it. It treats the program as data, like a universal Turing machine. With an operand stack, a call-frame stack and unbounded integers it is Turing-complete, so halting is undecidable. The VM therefore runs on a budget of 10,000 steps and 256 frames, and when the budget trips it explains the halting problem.",
    16: "Results. All seven phases are implemented and wired into the UI. On demo.snek the lexer produces 94 tokens in 700 DFA steps; the parser makes 559 PDA moves with zero LL(1) conflicts; the optimiser shrinks the main code object from 47 to 40 instructions; the VM prints hi. Six sample programs each fail in the phase they should, and seven self-check scripts pass.",
    17: "The live demo: first demo.snek through all seven phases using the scrubber and the explanation grid, then one error sample per phase: a lexical error, a syntax error with the expected token set, a type error, a run-time division by zero, and a non-halting loop stopped by the step budget.",
    18: "To conclude: every compiler phase is a machine, from a DFA through a PDA to a Turing-complete VM. The theory is heaviest in lexing and parsing; later phases run into ToC's limits: the pumping lemma, Rice's theorem and the halting problem. Future work includes generating the lexer DFA from regular expressions via Thompson's construction and subset construction. Thank you.",
}


def build():
    slides = []

    # 1 — cover.
    s = Slide(1, morph=False)
    s.orbs()
    s.ring(25.5, 9.5, 5.6, 244)
    s.ring_of_circles(25.5, 9.5, 5.6, 2.4, 20, "lit")
    s.text("#s1-title", "OUROBOROS", 1.6, 5.4, 17.5, 3.2, 60, font=HEAD, color=PRI)
    s.text("#s1-sub", "Visualizing a compiler through the Theory of Computation", 1.6, 8.6, 17, 2.7, 24, color=SOFT)
    s.text("#s1-meta", "Theory of Computation  ·  End-Semester Project", 1.6, 11.2, 17, 1.3, 18, color=TEAL, bold=True)
    s.text("#s1-lang", "language: Snek  ·  7 phases  ·  every step explained", 1.6, 16.2, 20, 1.2, 16, color=SOFT)
    slides.append(s)

    # 2 — introduction.
    s = Slide(2)
    s.orbs()
    s.ring(28.6, 3.9, 2.3, 300)
    s.ring_of_circles(28.6, 3.9, 2.3, 1.0, 11, "lit")
    std_header(s, "01 · INTRODUCTION", "Introduction")
    s.bullets("#s2-pts", [
        "Compilers are the most-used application of automata theory — yet we only ever see their input and output.",
        "Ouroboros opens the black box: a complete compiler for Snek, a small language we designed.",
        "Every phase records every step; the app replays it with What · Why · Formal rule · Next.",
        "Runs entirely in the browser (Preact + TypeScript).",
    ], 1.6, 4.4, 17.4, 12.5, size=20)
    s.box("#s2-code", "fn square(n) {\n  return n * n;\n}\nlet limit = 1 + 2;\nfor (let i = 0; i < limit; i = i + 1) {\n  total = total + square(i);\n}\nprint names[1];   # → hi",
          19.8, 7.6, 12.5, 8.6, "000000", size=14, font=MONO, color=SOFT, line=f"{DIMLINE}:1", align="left", valign="top")
    s.text("#s2-codel", "demo.snek", 19.8, 16.3, 12.5, 1.0, 16, color=SOFT)
    s.notes(NOTES[2])
    slides.append(s)

    # 3 — objectives.
    s = Slide(3)
    s.orbs()
    s.ring(4.0, 16.0, 2.4, 20)
    s.row_of_circles(22.6, 1.1, 1.5, 1.0, 11, lambda i: "lit")
    std_header(s, "02 · OBJECTIVES", "Objectives")
    objectives = [
        ("01", "Show each ToC machine — DFA, PDA, Turing-complete VM — running on real input."),
        ("02", "Build a complete 7-phase compiler that mirrors CPython's pipeline."),
        ("03", "Make every step explain itself: What · Why · Formal rule · Next."),
        ("04", "Demonstrate the limits live: non-CFLs, Rice's theorem, the halting problem."),
    ]
    w = (33.87 - 2 * 1.6 - 0.8) / 2
    for i, (num, txt) in enumerate(objectives):
        x, y = 1.6 + (i % 2) * (w + 0.8), 4.6 + (i // 2) * 5.6
        s.box(f"#s3-o{i}", "", x, y, w, 5.0, DIM, line=f"{DIMLINE}:1.5")
        s.text(f"#s3-n{i}", num, x + 0.6, y + 0.3, 3, 1.9, 32, font=HEAD, color=PRI)
        s.text(f"#s3-t{i}", txt, x + 0.6, y + 2.1, w - 1.2, 3.1, 20, color=WHITE, valign="top")
    s.notes(NOTES[3])
    slides.append(s)

    # 4 — theory: the Chomsky ladder.
    s = Slide(4)
    s.orbs()
    s.ring(33.6, 18.2, 4.8, 140, thick=12000)
    for i, y in enumerate((4.85, 6.9, 9.2, 10.9, 12.6, 14.3, 16.2), start=1):  # beside their bands
        s.circle(i, 2.3, y, 1.4, CLASS_COLOR[i], 14)
    s.text("#s4-kicker", "03 · THEORETICAL BACKGROUND", 4.2, 0.6, 28, 1.1, 18, color=TEAL, bold=True)
    s.text("#s4-title", "The Chomsky Hierarchy", 4.2, 1.5, 28, 2.4, 40, font=HEAD)
    bands = [
        ("#s4-b1", "REGULAR · DFA — Lexing        (Q, Σ, δ, q₀, F) · cannot count nested brackets", 3.9, 1.9, PRI),
        ("#s4-b2", "CONTEXT-FREE · PDA — Parsing        CFG → PDA · cannot check declarations ({wcw})", 5.95, 1.9, TEAL),
        ("#s4-b3", "DECIDABLE · algorithms — Semantic · IR · Optimize · Bytecode\nRice's theorem: non-trivial program properties are undecidable → decidable approximations", 8.0, 7.05, SEC),
        ("#s4-b4", "RECURSIVELY ENUMERABLE · TM — VM        halting is undecidable → step budget", 15.25, 1.9, AMB),
    ]
    for name, txt, y, h, c in bands:
        s.box(name, txt, 4.2, y, 28.0, h, c, size=18, color=WHITE, line=f"{c}:1.5", opacity=0.3, bold=True, align="left")
    s.notes(NOTES[4])
    slides.append(s)

    # 5 — where ToC is used (weights).
    s = Slide(5)
    s.orbs()
    s.ring(31.0, 3.2, 2.2, 80, thick=12000)
    s.text("#s5-kicker", "04 · TOC IN THIS PROJECT", 1.6, 0.6, 28, 1.1, 18, color=TEAL, bold=True)
    s.text("#s5-title", "Where the Theory Lives", 1.6, 1.5, 28, 2.4, 40, font=HEAD)
    rows = [
        ("Lexing", "DFA · regular languages", 5, "automaton"),
        ("Parsing", "CFG · PDA · LL(1)", 5, "automaton"),
        ("Semantic", "non-CFL {wcw} · Rice", 3, "a limit"),
        ("IR", "syntax-directed translation", 1, "translation"),
        ("Optimize", "fixpoints · Rice's theorem", 3, "a limit"),
        ("Bytecode", "computable encoding", 1, "translation"),
        ("VM", "Turing machine · halting", 3, "a limit"),
    ]
    for i, (name, concept, weight, kind) in enumerate(rows, start=1):
        y = 4.4 + 1.75 * (i - 1)
        s.circle(i, 2.3, y + 0.6, 1.2, "lit" if weight == 5 else "done" if weight == 3 else "todo", 12)
        s.text(f"#s5-n{i}", name, 3.4, y, 5.2, 1.2, 18, bold=True)
        s.text(f"#s5-c{i}", concept, 8.6, y, 11.4, 1.2, 18, color=SOFT)
        c = PRI if weight == 5 else SEC if weight == 3 else "1F3D2A"
        s.box(f"#s5-w{i}", "", 20.2, y + 0.2, 1.6 * weight, 0.8, c)
        s.text(f"#s5-k{i}", kind, 20.4 + 1.6 * weight, y, 5, 1.2, 16, color=PRI if weight == 5 else SOFT)
    s.box("#s5-note", "Phases 1–2 are pure automata theory — the core of the project. Phases 3, 5, 7 meet ToC's limits.",
          1.6, 16.6, 30.6, 2.0, DIM, size=18, color=WHITE, line=f"{PRI}:1.5", bold=True)
    s.notes(NOTES[5])
    slides.append(s)

    # 6 — system overview: the pipeline.
    s = Slide(6)
    s.orbs()
    s.ring(31.5, 16.8, 2.6, 200, thick=12000)
    std_header(s, "05 · SYSTEM OVERVIEW", "Seven Phases, One Pipeline")
    names = ["Lexing", "Parsing", "Semantic", "IR", "Optimize", "Bytecode", "VM"]
    outs = ["tokens", "AST", "typed AST", "instructions", "CFG · IR", "bytes", "output"]
    for i in range(1, 8):
        cx = 3.4 + (i - 1) * 4.5
        s.circle(i, cx, 7.6, 2.8, "lit", 24)
        s.text(f"#s6-n{i}", names[i - 1], cx - 2.2, 9.3, 4.4, 1.1, 18, bold=True, align="center")
        s.text(f"#s6-o{i}", outs[i - 1], cx - 2.2, 10.4, 4.4, 1.0, 16, color=TEAL, align="center")
        if i > 1:
            s.arrow(f"!!scene-p{i - 1}", f"!!scene-p{i}", PRI)
    s.text("#s6-src", "source.snek", 1.6, 4.4, 8, 1.1, 18, font=MONO, color=PRI)
    s.bullets("#s6-pts", [
        "Each phase reads only the previous phase's output — the same stages CPython uses.",
        "The first failing phase stops the pipeline; its error step names the broken rule.",
        "Every phase returns a replayable trace: the UI is a player for these traces.",
    ], 1.6, 11.8, 28, 6.0)
    s.notes(NOTES[6])
    slides.append(s)

    # 7–15 — phases.
    for n, k, kicker, title, items, diagram, action in PHASE_SLIDES:
        slides.append(phase_slide(n, k, kicker, title, items, diagram, action))

    # 16 — results.
    s = Slide(16)
    s.orbs()
    s.ring(30.4, 15.4, 2.6, 250, thick=12000)
    s.row_of_circles(22.6, 1.1, 1.5, 1.0, 11, lambda i: "done")
    std_header(s, "06 · RESULTS", "Results")
    stats = [
        ("7 / 7", "phases implemented and visualized"),
        ("94 · 700", "tokens · DFA steps on demo.snek"),
        ("559 · 0", "PDA moves · LL(1) conflicts"),
        ("47 → 40", "instructions after optimization, same output"),
        ("6 / 6", "sample programs fail in the right phase"),
        ("7 / 7", "self-check scripts pass"),
    ]
    w = (33.87 - 2 * 1.6 - 2 * 0.8) / 3
    for i, (big, label) in enumerate(stats):
        x, y = 1.6 + (i % 3) * (w + 0.8), 4.8 + (i // 3) * 5.6
        s.box(f"#s16-c{i}", "", x, y, w, 4.8, DIM, line=f"{DIMLINE}:1.5")
        s.text(f"#s16-b{i}", big, x + 0.5, y + 0.5, w - 1, 2.0, 36, font=HEAD, color=PRI)
        s.text(f"#s16-l{i}", label, x + 0.5, y + 2.6, w - 1, 1.9, 18, color=SOFT, valign="top")
    s.notes(NOTES[16])
    slides.append(s)

    # 17 — demo plan.
    s = Slide(17)
    s.orbs()
    s.ring(27.0, 10.0, 4.4, 150)
    s.ring_of_circles(27.0, 10.0, 4.4, 1.8, 16, "lit")
    std_header(s, "07 · DEMONSTRATION", "Live Demo")
    s.bullets("#s17-pts", [
        "demo.snek through all 7 phases — scrubber + explanation grid",
        "err-lex.snek — 123abc → BAD_NUMBER in the DFA",
        "err-parse.snek — empty LL(1) cell → expected-token set",
        "err-semantic.snek — int + bool: no typing rule",
        "err-runtime / err-halt — division by zero · step budget (halting)",
    ], 1.6, 4.4, 19.4, 10.5, size=20)
    s.text("#s17-url", "github.com/OrangeSorbet/Ouroboros", 1.6, 16.0, 19, 1.3, 20, color=TEAL, bold=True)
    s.notes(NOTES[17])
    slides.append(s)

    # 18 — conclusion: the snake closes its tail.
    s = Slide(18)
    s.orbs()
    s.ring(25.5, 9.8, 5.6, 244, gap=2)
    s.ring_of_circles(25.5, 9.8, 5.6, 2.4, 20, "done")
    s.text("#s18-kicker", "08 · CONCLUSION", 1.6, 0.6, 17, 1.1, 18, color=TEAL, bold=True)
    s.text("#s18-title", "The snake eats its tail.", 1.6, 1.5, 17.5, 4.6, 40, font=HEAD, color=PRI)
    s.bullets("#s18-pts", [
        "Every compiler phase is a machine: DFA → PDA → algorithms → a Turing-complete VM.",
        "ToC is heaviest in Phases 1–2; later phases meet its limits.",
        "Nothing hidden: every step is replayable and explained.",
        "Future work: regex → NFA → DFA (Thompson + subset construction).",
    ], 1.6, 6.4, 17.2, 9.4, size=18)
    s.text("#s18-thanks", "Thank you  —  questions?", 1.6, 16.2, 17, 1.5, 24, font=HEAD, color=AMB)
    s.notes(NOTES[18])
    slides.append(s)
    return slides


def main():
    cli("close", OUT, check=False)
    if os.path.exists(OUT):
        os.remove(OUT)
    cli("create", OUT)
    with tempfile.TemporaryDirectory() as tmp:
        for s in build():
            ops = s.ops
            for start in range(0, len(ops), 12):  # skill rule: batches of <= 12 ops
                path = os.path.join(tmp, "ops.json")
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(ops[start:start + 12], f, ensure_ascii=False)
                out = cli("batch", OUT, "--input", path)
                if " 0 failed" not in out:
                    sys.exit(f"slide {s.n} batch failed:\n{out}")
    cli("close", OUT)
    print(cli("validate", OUT))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
