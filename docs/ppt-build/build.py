#!/usr/bin/env python3
"""Builds docs/Ouroboros_TOC_Endsem.pptx with officecli (morph deck).

Run from anywhere:  python docs/ppt-build/build.py
Plan + morph choreography: docs/ppt-build/brief.md
"""
import json, math, os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "Ouroboros_TOC_Endsem.pptx"))
OFFICECLI = shutil.which("officecli") or os.path.expandvars(r"%LOCALAPPDATA%\OfficeCLI\officecli.exe")

BG = "0B0120-2A0A4A-4C0B45-135"
MAG, VIO, CYAN, AMB = "FF2E93", "8B5CF6", "22D3EE", "FBBF24"
WHITE, SOFT, DIM, DIMLINE = "FFFFFF", "E9D5FF", "2A0A4A", "A78BFA"
HEAD, BODY, MONO = "Arial Black", "Segoe UI", "Consolas"
CLASS_COLOR = {1: CYAN, 2: VIO, 3: MAG, 4: MAG, 5: MAG, 6: MAG, 7: AMB}


def cm(v):
    return f"{v:.2f}cm"


def cli(*args, check=True):
    r = subprocess.run([OFFICECLI, *args], capture_output=True, text=True, encoding="utf-8")
    if check and r.returncode != 0:
        sys.exit(f"officecli {' '.join(args)} failed:\n{r.stdout}\n{r.stderr}")
    return r.stdout


class Slide:
    def __init__(self, n, morph=True):
        self.n, self.ops = n, []
        props = {"layout": "blank", "background": BG}
        if morph:
            props["transition"] = "morph"
        self.ops.append({"command": "add", "parent": "/", "type": "slide", "props": props})

    def shape(self, name, **props):
        p = {"name": name, "line": "none"}
        p.update({k: (cm(v) if k in ("x", "y", "width", "height") else str(v)) for k, v in props.items()})
        self.ops.append({"command": "add", "parent": f"/slide[{self.n}]", "type": "shape", "props": p})

    def text(self, name, txt, x, y, w, h, size, font=BODY, color=WHITE, bold=False, align="left", **extra):
        self.shape(name, text=txt, x=x, y=y, width=w, height=h, size=size, font=font, color=color,
                   bold=str(bold).lower(), align=align, fill="none", valign="middle", **extra)

    def box(self, name, txt, x, y, w, h, fill, size=18, font=BODY, color=WHITE, line=None, opacity=None, bold=False, align="center"):
        extra = {"opacity": opacity} if opacity is not None else {}
        self.shape(name, preset="roundRect", text=txt, x=x, y=y, width=w, height=h, fill=fill, size=size,
                   font=font, color=color, bold=str(bold).lower(), align=align, valign="middle",
                   **({"line": line} if line else {}), **extra)

    def arrow(self, a, b, color=SOFT, dash=None):
        p = {"shape": "straight", "from": f"/slide[{self.n}]/shape[@name=!!{a}]",
             "to": f"/slide[{self.n}]/shape[@name=!!{b}]", "color": color, "lineWidth": "2pt", "tailEnd": "triangle"}
        if dash:
            p["lineDash"] = dash
        self.ops.append({"command": "add", "parent": f"/slide[{self.n}]", "type": "connector", "props": p})

    def notes(self, txt):
        self.ops.append({"command": "set", "path": f"/slide[{self.n}]", "props": {"notes": txt}})

    # --- scene actors -------------------------------------------------------
    def orbs(self, o1, o2):
        self.shape("!!scene-orb1", preset="ellipse", x=o1[0], y=o1[1], width=15, height=15, fill=MAG, opacity=0.32, softEdge=60)
        self.shape("!!scene-orb2", preset="ellipse", x=o2[0], y=o2[1], width=11, height=11, fill=CYAN, opacity=0.2, softEdge=50)

    def ring(self, cx, cy, r, rot, gap=30, thick=6000):
        # The snake: a block arc whose centre line has radius r, with a `gap`°
        # opening (its mouth) centred at `rot`° clockwise from 3 o'clock.
        d = 2 * r / (1 - thick / 100000)
        st, end = (rot + gap / 2) % 360, (rot - gap / 2) % 360
        adj = f"adj1:val {int(st * 60000)},adj2:val {int(end * 60000)},adj3:val {thick}"
        self.shape("!!scene-ring", preset="blockArc", x=cx - d / 2, y=cy - d / 2, width=d, height=d,
                   gradient=f"{MAG}-{VIO}-45", glow=MAG, adj=adj)

    def circle(self, i, cx, cy, d, style, size):
        p = dict(preset="ellipse", x=cx - d / 2, y=cy - d / 2, width=d, height=d, text=str(i), size=size,
                 font=HEAD, color=WHITE, align="center", valign="middle", margin=0)
        if style == "hero":
            p.update(gradient=f"{MAG}-{VIO}-45", glow=MAG)
        elif style == "lit":
            p.update(gradient=f"{MAG}-{VIO}-45")
        elif style == "done":
            p.update(fill=MAG)
        elif style == "todo":
            p.update(fill=DIM, line=f"{DIMLINE}:1.5")
        else:  # a class colour on the ladder slide
            p.update(fill=style)
        self.shape(f"!!scene-p{i}", **p)

    def ring_of_circles(self, cx, cy, r, d, size, style):
        for i in range(1, 8):
            a = math.radians(-90 + (i - 1) * 360 / 7)
            self.circle(i, cx + r * math.cos(a), cy + r * math.sin(a), d, style, size)


PHASES = [
    ("Lexing", "PHASE 1 · DFA", "Characters become tokens. Longest match, no ε-moves, one DEAD trap state."),
    ("Parsing", "PHASE 2 · PDA  ·  LL(1)", "A one-stack machine checks the tokens against the grammar. The table picks every move."),
    ("Semantics", "PHASE 3 · SCOPE STACK", "Declared-before-use and types are beyond context-free, so a symbol table walks the tree."),
    ("IR", "PHASE 4 · SYNTAX-DIRECTED TRANSLATION", "A post-order walk turns the tree into stack instructions: operands first, operator last."),
    ("Optimize", "PHASE 5 · CONTROL-FLOW GRAPH", "Blocks and edges, then fold and prune to a fixpoint. Only provably dead code goes."),
    ("Bytecode", "PHASE 6 · WORDCODE", "Every instruction becomes 2 bytes. Labels become relative jumps."),
    ("VM", "PHASE 7 · UNIVERSAL MACHINE", "Fetch, decode, execute. Two stacks + unbounded integers = Turing power."),
]

NOTES = {
    2: "Snek is a toy language we designed: integers, strings, arrays, functions, if/while/for. It is small on purpose. It goes through the same seven phases as CPython: tokenize, parse, check, compile to stack instructions, optimize on a control-flow graph, emit bytecode, run on a stack VM. The difference is that every state, every grammar rule and every byte fits on one screen, so nothing is hidden.",
    3: "This is the spine of the talk. Each phase uses the weakest machine that can do its job, and each machine's limit is why the next phase exists. A DFA can't count nested brackets, so parsing needs a stack. A PDA can't check declared-before-use (that is like the language w c w, not context-free by the pumping lemma), so semantic analysis uses a symbol table. The middle phases are decidable algorithms. The VM is as powerful as a Turing machine, so halting becomes undecidable.",
    4: "The lexer is a real DFA: states, alphabet of character classes, transition function, start state, accepting states, shown on screen. There are no epsilon moves; accept-and-restart is the scanner's action. Every state has an edge for every class, and invalid input falls into a DEAD trap state, so the function is total. The scanner keeps moving while it can and backs up to the last accepting state: longest match, which is why <= is one token. 123abc lands in BAD_NUMBER, like real compilers.",
    5: "The grammar is data, in pure BNF. From it we compute FIRST and FOLLOW by fixpoint iteration and build the LL(1) table. Every cell holds at most one production, which makes the PDA deterministic. The PDA has one state; all the work happens on the stack: expand a non-terminal using the table, or match a terminal against the input. The app shows the stack, the leftmost derivation and the exact table cell used, then folds the parse tree into an AST.",
    6: "Is x declared before it is used? That is the language w c w, and the pumping lemma shows it is not context-free, so no PDA can check it. Semantic analysis walks the AST with a stack of scopes: the symbol table. It hoists function names first, resolves every name to a slot and types every expression. Exact typing is undecidable (Rice's theorem), so function parameters stay unknown and the VM checks them at run time.",
    7: "Now we translate instead of recognise. Each AST node kind has one translation rule, applied in post-order, so operands are pushed before the operator that pops them, exactly what a stack machine needs. For loops are desugared to while loops. Forward jumps are emitted with a question mark and backpatched when their label appears. The output is one code object per function, like CPython.",
    8: "The instructions are cut into basic blocks at leaders and joined by edges: the control-flow graph. Then rewrite rules run until nothing changes, a fixpoint: constant folding turns 1 + 2 into 3, branches on constants are folded, unreachable blocks are deleted. Rice's theorem says deciding whether code is really dead is impossible in general, so we only remove code with no path in the graph, which is decidable. 1 / 0 is never folded; that error belongs at run time.",
    9: "The assembler packs each instruction into 2 bytes, opcode and argument, like CPython's wordcode. Labels become relative offsets counted in instructions. Arguments above 255 need EXTENDED_ARG prefixes; a longer jump can push other jumps further, so sizes are recomputed until nothing grows, another fixpoint. The right panel shows a dis-style listing with the raw hex bytes.",
    10: "The VM reads the bytes: fetch the opcode at the program counter, decode, execute, repeat. It treats the program as data, like a universal Turing machine. One stack is a PDA; this machine has two, operand stack and call frames, plus unbounded integers, so Snek is Turing-complete. Therefore halting is undecidable: the VM runs on a budget of 10,000 steps, and err-halt.snek shows that limit tripping with the explanation.",
    11: "Source text goes in and comes out as a machine running it: the snake eats its tail. Every step on the way explains what happened, why, the formal rule behind it and what comes next. Now the live demo: demo.snek through all seven phases, then the error samples.",
}

# Where the two light blobs drift, per slide (cm, top-left).
ORBS = {1: ((18, -3), (-3, 11)), 2: ((22, 8), (2, -4)), 3: ((-4, 8), (24, -3)), 11: ((14, -4), (20, 11))}
for k in range(1, 8):
    ORBS[3 + k] = ((-5, 9), (26, 12)) if k % 2 else ((22, -4), (-3, 10))


def build():
    slides = []

    # 1 — cover: the snake ring on the right.
    s = Slide(1, morph=False)
    s.orbs(*ORBS[1])
    s.ring(25.5, 9.5, 5.6, 244)
    s.ring_of_circles(25.5, 9.5, 5.6, 2.4, 20, "lit")
    s.text("#s1-title", "OUROBOROS", 1.6, 5.6, 17.5, 3.2, 60, font=HEAD)
    s.text("#s1-sub", "A compiler that shows its work.", 1.6, 8.9, 17, 1.6, 26, color=SOFT)
    s.text("#s1-meta", "Theory of Computation  ·  End-Sem Project", 1.6, 10.7, 17, 1.3, 18, color=CYAN, bold=True)
    s.text("#s1-lang", "language: Snek  ·  7 phases  ·  every step explained", 1.6, 16.2, 20, 1.2, 16, color=SOFT)
    slides.append(s)

    # 2 — toy language, real compiler.
    s = Slide(2)
    s.orbs(*ORBS[2])
    s.ring(28.6, 4.6, 2.3, 300)
    s.ring_of_circles(28.6, 4.6, 2.3, 1.0, 11, "lit")
    s.text("#s2-t1", "Toy language.", 1.6, 2.1, 22, 2.6, 44, font=HEAD)
    s.text("#s2-t2", "Real compiler.", 1.6, 4.5, 22, 2.6, 44, font=HEAD, color=MAG)
    s.text("#s2-body", "Snek runs the same 7 phases as CPython — small enough that every state, rule and byte fits on one screen.", 1.6, 7.4, 24, 2.6, 22, color=SOFT)
    s.text("#s2-l1", "CPython", 1.6, 11.6, 5, 1.3, 20, bold=True)
    s.box("#s2-b1", "", 7.0, 11.7, 24.5, 1.1, "6B6B8A")
    s.text("#s2-l2", "Snek", 1.6, 13.6, 5, 1.3, 20, bold=True, color=MAG)
    s.box("#s2-b2", "", 7.0, 13.7, 5.5, 1.1, MAG)
    s.text("#s2-cap", "grammar size, illustrative — same pipeline, a fraction of the rules", 7.0, 15.3, 24, 1.2, 16, color=SOFT)
    s.notes(NOTES[2])
    slides.append(s)

    # 3 — the Chomsky ladder.
    s = Slide(3)
    s.orbs(*ORBS[3])
    s.ring(33.6, 18.2, 4.8, 140, thick=12000)
    for i in range(1, 8):
        s.circle(i, 2.3, 3.8 + 2.0 * (i - 1), 1.4, CLASS_COLOR[i], 14)
    s.text("#s3-title", "Climbing the Chomsky ladder", 4.2, 0.5, 28, 2.2, 40, font=HEAD)
    bands = [
        ("#s3-b1", "REGULAR  ·  DFA  —  Lexing        can't count brackets", 2.9, 1.8, CYAN),
        ("#s3-b2", "CONTEXT-FREE  ·  PDA  —  Parsing        can't check declarations", 4.9, 1.8, VIO),
        ("#s3-b3", "DECIDABLE  ·  algorithms  —  Semantic · IR · Optimize · Bytecode\nRice's theorem: only provable facts, never exact answers", 7.0, 7.6, MAG),
        ("#s3-b4", "RECURSIVELY ENUMERABLE  ·  TM  —  VM        halting is undecidable", 15.0, 1.8, AMB),
    ]
    for name, txt, y, h, c in bands:
        s.box(name, txt, 4.2, y, 28.0, h, c, size=18, line=f"{c}:1.5", opacity=0.35, bold=True, align="left")
    s.notes(NOTES[3])
    slides.append(s)

    # 4–10 — one hero phase per slide, the rest in a progress strip.
    for k, (title, kicker, line) in enumerate(PHASES, start=1):
        n = 3 + k
        s = Slide(n)
        s.orbs(*ORBS[n])
        s.ring(6.5, 8.9, 5.3, (200 + 40 * k) % 360)
        for i in range(1, 8):
            if i == k:
                s.circle(i, 6.5, 8.9, 9.0, "hero", 110)
            else:
                s.circle(i, 14.1 + (i - 1) * 1.65, 17.2, 1.2, "done" if i < k else "todo", 11)
        p = f"#s{n}"
        s.text(f"{p}-kicker", kicker, 13.6, 1.4, 19, 1.2, 18, color=CYAN, bold=True)
        s.text(f"{p}-title", title, 13.6, 2.5, 19, 2.6, 48, font=HEAD)
        s.text(f"{p}-line", line, 13.6, 5.2, 18.7, 2.8, 20, color=SOFT)
        DIAGRAMS[k](s, p)
        s.notes(NOTES[n])
        slides.append(s)

    # 11 — the snake closes its tail.
    s = Slide(11)
    s.orbs(*ORBS[11])
    s.ring(25.5, 9.5, 5.6, 244, gap=2)
    s.ring_of_circles(25.5, 9.5, 5.6, 2.4, 20, "done")
    s.text("#s11-title", "The snake eats its tail.", 1.6, 3.9, 17.5, 4.8, 44, font=HEAD)
    s.text("#s11-body", "Source text in. A running machine out. Every step explained.", 1.6, 8.8, 17, 2.4, 22, color=SOFT)
    s.text("#s11-link", "github.com/OrangeSorbet/Ouroboros", 1.6, 12.0, 17, 1.3, 20, color=CYAN, bold=True)
    s.text("#s11-demo", "Live demo  →", 1.6, 14.6, 12, 1.6, 28, font=HEAD, color=AMB)
    s.notes(NOTES[11])
    slides.append(s)
    return slides


# --- per-phase mini diagrams (content area x 13.6–32.3, y 8.6–15.8) ------------

def d_lex(s, p):
    s.shape(f"{p}-start", preset="ellipse", text="q0", x=13.8, y=9.4, width=2.8, height=2.8, fill=DIM, line=f"{CYAN}:2", size=18, font=BODY, color=WHITE, bold="true", align="center", valign="middle")
    for name, label, y in (("ident", "ID", 8.2), ("num", "NUM", 11.7)):
        s.shape(f"{p}-{name}o", preset="ellipse", x=20.2, y=y, width=2.8, height=2.8, fill="none", line=f"{MAG}:2")
        s.shape(f"{p}-{name}", preset="ellipse", text=label, x=20.5, y=y + 0.3, width=2.2, height=2.2, fill=MAG, size=16, font=BODY, color=WHITE, bold="true", align="center", valign="middle", margin=0)
    s.shape(f"{p}-dead", preset="ellipse", text="DEAD", x=27.4, y=11.7, width=2.8, height=2.8, fill="3F3F5A", size=14, font=BODY, color=WHITE, bold="true", align="center", valign="middle")
    s.arrow(f"{p}-start", f"{p}-idento", CYAN)
    s.arrow(f"{p}-start", f"{p}-numo", CYAN)
    s.arrow(f"{p}-numo", f"{p}-dead", AMB)
    s.text(f"{p}-l1", "letter", 16.3, 8.2, 3.5, 1.0, 16, color=CYAN)
    s.text(f"{p}-l2", "digit", 16.3, 12.9, 3.5, 1.0, 16, color=CYAN)
    s.text(f"{p}-l3", "letter → 123abc ✗", 23.4, 10.3, 8.5, 1.0, 16, color=AMB)
    for i, ch in enumerate("let x=1;"):
        s.box(f"{p}-tape{i}", ch if ch != " " else "␣", 13.8 + i * 1.3, 15.0, 1.15, 1.15, MAG if i < 3 else DIM, size=16, font=MONO, line=f"{DIMLINE}:1")


def d_parse(s, p):
    for i, (label, top) in enumerate((("Program", False), ("Decl*", False), ("Statement", False), ("LetStmt", True))):
        s.box(f"{p}-st{i}", label, 13.8, 14.4 - i * 1.45, 5.6, 1.25, MAG if top else DIM, size=16, font=MONO, line=f"{DIMLINE}:1")
    s.text(f"{p}-stl", "stack (top ↑)", 13.8, 15.8, 5.6, 1.0, 16, color=SOFT)
    cols = ["", "let", "print"]
    rows = [("Statement", "LetStmt", "PrintStmt"), ("Decl", "Statement", "Statement")]
    for j, h in enumerate(cols):
        s.box(f"{p}-h{j}", h, 20.6 + j * 3.8, 9.0, 3.6, 1.3, "3B1466", size=16, font=MONO)
    for r, row in enumerate(rows):
        for j, cell in enumerate(row):
            hot = r == 0 and j == 1
            s.box(f"{p}-c{r}{j}", cell, 20.6 + j * 3.8, 10.5 + r * 1.5, 3.6, 1.3, MAG if hot else DIM, size=14, font=MONO, line=f"{DIMLINE}:1")
    s.text(f"{p}-tl", "LL(1) table: one entry per cell = deterministic", 20.6, 13.6, 11.6, 2.1, 16, color=SOFT)


def d_sem(s, p):
    s.shape(f"{p}-g", preset="roundRect", x=13.8, y=8.8, width=18.4, height=7.0, fill="none", line=f"{VIO}:2")
    s.text(f"{p}-gl", "global scope", 14.2, 9.0, 8, 1.1, 16, color=VIO, bold=True)
    for i, chip in enumerate(("square : fn(1)", "limit : int", "total : int")):
        s.box(f"{p}-gc{i}", chip, 14.3, 10.3 + i * 1.7, 6.6, 1.3, DIM, size=16, font=MONO, line=f"{CYAN}:1")
    s.shape(f"{p}-f", preset="roundRect", x=22.0, y=10.4, width=9.6, height=4.8, fill="none", line=f"{MAG}:2")
    s.text(f"{p}-fl", "fn square", 22.4, 10.6, 6, 1.1, 16, color=MAG, bold=True)
    s.box(f"{p}-fc", "n : unknown", 22.5, 12.2, 6.6, 1.3, DIM, size=16, font=MONO, line=f"{AMB}:1")
    s.text(f"{p}-fn", "checked at run time (Rice)", 22.4, 13.5, 9, 1.6, 14, color=AMB)


def d_ir(s, p):
    s.shape(f"{p}-plus", preset="ellipse", text="+", x=15.5, y=9.0, width=2.0, height=2.0, fill=MAG, size=24, font=HEAD, color=WHITE, align="center", valign="middle")
    s.shape(f"{p}-one", preset="ellipse", text="1", x=13.9, y=12.6, width=1.8, height=1.8, fill=DIM, line=f"{CYAN}:1.5", size=18, font=HEAD, color=WHITE, align="center", valign="middle")
    s.shape(f"{p}-two", preset="ellipse", text="2", x=17.3, y=12.6, width=1.8, height=1.8, fill=DIM, line=f"{CYAN}:1.5", size=18, font=HEAD, color=WHITE, align="center", valign="middle")
    s.arrow(f"{p}-plus", f"{p}-one")
    s.arrow(f"{p}-plus", f"{p}-two")
    for i, ins in enumerate(("LOAD_CONST  1", "LOAD_CONST  2", "BINARY_OP   +", "STORE_FAST  limit")):
        s.box(f"{p}-i{i}", ins, 21.4, 8.9 + i * 1.65, 10.6, 1.35, MAG if i == 2 else DIM, size=18, font=MONO, line=f"{DIMLINE}:1", align="left")
    s.text(f"{p}-cap", "children first, then the node", 13.6, 14.8, 7.5, 1.7, 14, color=SOFT)


def d_opt(s, p):
    s.box(f"{p}-b0", "B0   limit = 3", 13.8, 8.9, 8.0, 1.8, DIM, size=18, font=MONO, line=f"{CYAN}:2", align="left")
    s.box(f"{p}-b1", "B1   print names[1]", 13.8, 13.6, 8.0, 1.8, DIM, size=18, font=MONO, line=f"{CYAN}:2", align="left")
    s.box(f"{p}-b2", 'B2   print "never"', 24.0, 11.3, 8.2, 1.8, "3F3F5A", size=18, font=MONO, line=f"{AMB}:2:dash", align="left")
    s.arrow(f"{p}-b0", f"{p}-b1", CYAN)
    s.arrow(f"{p}-b0", f"{p}-b2", AMB, dash="dash")
    s.text(f"{p}-dead", "no path → removed", 24.0, 13.3, 8.2, 1.1, 16, color=AMB, bold=True)
    s.box(f"{p}-fold", "1 + 2   ⟶   3", 24.0, 8.9, 8.2, 1.5, MAG, size=18, font=MONO, bold=True)


def d_bc(s, p):
    s.text(f"{p}-ins", "POP_JUMP_IF_FALSE   L_else", 13.8, 8.8, 18, 1.4, 22, font=MONO, color=WHITE, bold=True)
    s.text(f"{p}-off", "↓   L_else is 3 instructions ahead  →  +3", 13.8, 10.3, 18, 1.3, 18, color=CYAN)
    for i, b in enumerate(("20", "00", "2C", "03", "06", "00", "05", "00")):
        hot = i in (2, 3)
        s.box(f"{p}-by{i}", b, 13.8 + i * 2.3, 12.2, 2.0, 2.0, MAG if hot else DIM, size=20, font=MONO, line=f"{DIMLINE}:1", bold=hot)
    s.text(f"{p}-cap", "opcode · arg   —   2 bytes per instruction", 13.8, 14.8, 18, 1.2, 16, color=SOFT)


def d_vm(s, p):
    for i, v in enumerate(('"hi"', "[…]", "3")):
        s.box(f"{p}-os{i}", v, 13.8, 13.3 - i * 1.5, 5.2, 1.3, MAG if i == 0 else DIM, size=16, font=MONO, line=f"{DIMLINE}:1")
    for i, v in enumerate(("<main>", "square")):
        s.box(f"{p}-fr{i}", v, 20.0, 13.3 - i * 1.5, 5.2, 1.3, VIO if i == 1 else DIM, size=16, font=MONO, line=f"{DIMLINE}:1")
    s.box(f"{p}-con", "> hi", 26.2, 10.3, 6.0, 4.3, "000000", size=22, font=MONO, color=CYAN, opacity=0.6, align="left")
    s.text(f"{p}-l1", "operand stack", 13.8, 14.8, 5.4, 1.1, 16, color=SOFT)
    s.text(f"{p}-l2", "call frames", 20.0, 14.8, 5.4, 1.1, 16, color=SOFT)
    s.text(f"{p}-l3", "console", 26.2, 14.8, 5.4, 1.1, 16, color=SOFT)
    s.text(f"{p}-cap", "step cap 10 000 — halting problem", 13.8, 8.7, 18, 1.1, 16, color=AMB, bold=True)


DIAGRAMS = {1: d_lex, 2: d_parse, 3: d_sem, 4: d_ir, 5: d_opt, 6: d_bc, 7: d_vm}


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
