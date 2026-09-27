import type { ComponentChildren } from "preact";
import type { Explanation } from "../compiler/trace";
import { GLOSSARY } from "../compiler/messages/glossary";
import type { GlossaryEntry } from "../compiler/messages/glossary";
import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";

// Height of the 2×2 grid (two rows of header + two clamped text lines).
// Fixed, so the scrubber never changes height between steps.
export const EXPLANATION_GRID_HEIGHT = 92;

const byText = new Map<string, GlossaryEntry>();
for (const g of GLOSSARY) for (const t of [g.term, ...(g.aliases ?? [])]) byText.set(t.toLowerCase(), g);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Longest first so "dead code" wins over a shorter overlapping term. Word
// boundaries are spelled as Unicode lookarounds because \b doesn't treat
// "δ", "Σ" or "LL(1)" as words.
const TERM_RE = new RegExp(
  `(?<![\\p{L}\\p{N}_])(${[...byText.keys()].sort((a, b) => b.length - a.length).map(escape).join("|")})(?![\\p{L}\\p{N}_])`,
  "giu",
);

// Splits text into plain runs and <Term>s. `seen` is shared across the four
// cells so each term is underlined once per step, not on every repetition.
function linkTerms(text: string, seen: Set<GlossaryEntry>): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  let last = 0;
  for (const m of text.matchAll(TERM_RE)) {
    const entry = byText.get(m[0].toLowerCase())!;
    if (seen.has(entry)) continue;
    if (entry.caseSensitive && ![entry.term, ...(entry.aliases ?? [])].includes(m[0])) continue;
    seen.add(entry);
    out.push(text.slice(last, m.index), <Term key={m.index} entry={entry}>{m[0]}</Term>);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

// Native title tooltip on purpose: cells clamp with overflow:hidden, which
// would clip a custom popover, and the innermost title wins over the cell's.
export function Term({ entry, children }: { entry: GlossaryEntry; children: ComponentChildren }) {
  return (
    <span
      title={`${entry.term}: ${entry.def}`}
      style={{ textDecoration: `underline dotted ${colors.textSecondary}`, textUnderlineOffset: 3, cursor: "help" }}
    >
      {children}
    </span>
  );
}

const CELLS: { key: keyof Explanation; title: string; mono?: boolean }[] = [
  { key: "what", title: "What happened" },
  { key: "why", title: "Why (theory)" },
  { key: "formal", title: "Formal notation", mono: true },
  { key: "next", title: "What's next" },
];

export function ExplanationGrid({ explain }: { explain?: Explanation }) {
  const seen = new Set<GlossaryEntry>();
  return (
    <div
      className="step-fade-in"
      key={explain ? explain.what + explain.formal : "empty"}
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: "4px 16px", height: EXPLANATION_GRID_HEIGHT }}
    >
      {CELLS.map(({ key, title, mono }) => {
        const text = explain?.[key] ?? "";
        return (
          <div key={key} style={{ minWidth: 0 }}>
            <div style={{ fontFamily: fonts.base, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: colors.textSecondary, lineHeight: "12px" }}>
              {title}
            </div>
            <div
              title={text}
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                fontFamily: mono ? fonts.mono : fonts.base,
                fontSize: mono ? 11.5 : 12,
                lineHeight: "16px",
                color: mono ? colors.accent : colors.textPrimary,
              }}
            >
              {linkTerms(text, seen)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
