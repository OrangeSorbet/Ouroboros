1. No deviation from checklist.md roadmap order.
2. Strict modularity: colors.*, fonts.*, and each UI component live in their own file. app.py/interface layer only imports and composes — no inline styling, no inline component definitions.
3. No placeholder/dummy code. No TODOs left unresolved in committed files.
4. Rewriter edits: "find" must be the shortest substring that is still unique in the file — a few words is enough, no need for full lines/blocks/sentences.