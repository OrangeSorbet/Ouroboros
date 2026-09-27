# Working Rules for Ouroboros

Rules for whoever (human or agent) works on this repo. Canonical location —
`tooldata/rules.md` is superseded by this file; don't read `tooldata/` at all.

## Off-limits

- **Never read or reference `tooldata/`.** Treat it as opaque/off-limits —
  don't open its files, don't cite it, don't sync docs against it.
- **Never create a git worktree.**
- **Never touch git at all** — no `init`, `add`, `commit`, `push`, `branch`,
  `checkout`, nothing. All code changes stay as local, uncommitted file
  edits. If version control is ever wanted, that's a separate explicit
  request, not something to set up proactively.
- **Never touch npm, no matter what.** No `npm`/`npx` execution of any kind
  (no `install`, `run`, `exec`, `ci`, `update`, nothing). If a dependency
  needs installing, say so and let the user run it themselves.

## Pedagogy

This is a Theory of Computation course project, and the user is learning
ToC *by building it* — not just shipping a working app. That changes what
"done" means:

- **Every step, feature, and explanation needs a reason, in ToC terms, not
  just a description of what it does.** Don't just say a step happened —
  say why the automaton/grammar/parser is required to behave that way (e.g.
  not "consumes '='" but "the grammar requires '=' here, separating the
  declared name from its value"). This applies to in-app descriptions
  (`messages.ts`) and to how changes get explained in chat.
- Never quietly work around a ToC gap (e.g. a `let`-only grammar with no way
  to reassign a variable) without first explaining *why* it's a gap in
  formal terms and what the fix means theoretically — the explanation is
  the point, not just the patch.
- When correctness and theoretical accuracy conflict with a simpler
  implementation, default to the theoretically accurate one and say so,
  rather than silently taking a shortcut a ToC course would mark wrong
  (e.g. real DFAs have no epsilon-transitions — that distinction has to be
  explained, not glossed over, even if the visualization uses one as a
  shorthand).
- Keep the whole project's vibe grounded in ToC vocabulary: states,
  transitions, alphabets, accepting states, derivations, PDA stack
  push/pop, decidability — reach for those terms over generic
  programming-speak when both would do.

## Process

- **Ask before moving on.** Don't chain unrequested follow-up work onto a
  request. When a task is done, stop and report — don't assume the next
  logical step is wanted.
- **Confirm before large/ambiguous changes.** If a request could be read
  multiple ways (e.g. "fix the graph" — which graph, what's actually wrong),
  clarify before touching files. Small, unambiguous fixes don't need this.
- **Verify before claiming done.** Every change gets checked with
  `node node_modules/typescript/bin/tsc -b --force` then
  `node node_modules/vite/bin/vite.js build` before reporting success
  (called through `node` directly — never via `npm`/`npx`, see Off-limits).
  If either fails, fix it before saying the task is complete.
- **No deviation from `docs/checklist.md`'s roadmap order** unless the user
  explicitly redirects.
- **No placeholder/dummy code, no unresolved TODOs** left in committed
  files.

## Code style

- **Strict modularity**: `colors.*`, `fonts.*`, and each UI component live
  in their own file. `app.tsx` only imports and composes — no inline
  styling helpers, no inline component definitions.
- Compiler logic (`src/compiler/`) stays free of UI prose — all
  human-readable text lives under `src/compiler/messages/` (one file per
  phase, plus shared glossary/intro-card files), not scattered across
  `dfa.ts`/`lexer.ts`/`parser.ts`/`steps.ts`. When splitting the old
  single `messages.ts`, existing text is moved verbatim (copied, not
  rewritten); only new text is newly written.