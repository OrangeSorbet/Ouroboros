import type { ComponentChildren } from "preact";
import { ACCEPTING, CLASSES, CLASS_LABELS, STATES } from "../../compiler/dfa";
import type { AcceptAction } from "../../compiler/dfa";
import type { DfaStep } from "../../compiler/lexer";
import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";

export function actionLabel(a: AcceptAction): string {
  if (a === "discard") return "skip";
  if ("error" in a) return "error";
  if (a.emit === "identOrKeyword") return "IDENT/kw";
  if (a.emit === "byLexeme") return "by lexeme";
  return `emit ${a.emit}`;
}

// The current state of the machine: the target of a move, otherwise the
// state the scanner is stopped / acting in.
export const currentState = (s: DfaStep) => (s.kind === "move" ? s.to : s.from);

function Chip({ text, on, title, tone }: { text: string; on: boolean; title?: string; tone?: string }) {
  return (
    <span
      title={title}
      style={{
        display: "inline-block",
        margin: "1px 2px",
        padding: "0 4px",
        borderRadius: 3,
        border: `1px solid ${on ? colors.nodeActive : colors.border}`,
        color: on ? colors.textPrimary : tone ?? colors.textSecondary,
        background: on ? colors.nodeIdle : "transparent",
      }}
    >
      {text}
    </span>
  );
}

const Row = ({ name, children }: { name: string; children: ComponentChildren }) => (
  <div style={{ marginBottom: 8 }}>
    <div style={{ color: colors.textPrimary, marginBottom: 2 }}>{name}</div>
    <div style={{ lineHeight: 1.7 }}>{children}</div>
  </div>
);

// M = (Q, Σ, δ, q₀, F) with the live state and input class picked out.
export function FiveTuple({ step }: { step: DfaStep }) {
  const q = currentState(step);
  return (
    <div style={{ padding: "8px 10px", fontFamily: fonts.mono, fontSize: 10.5, color: colors.textSecondary }}>
      <Row name={`Q — ${STATES.length} states`}>
        {STATES.map((s) => <Chip key={s} text={s} on={s === q} />)}
      </Row>
      <Row name={`Σ — ${CLASSES.length} character classes`}>
        {CLASSES.map((c) => <Chip key={c} text={c} title={CLASS_LABELS[c]} on={c === step.cls} />)}
      </Row>
      <Row name="δ : Q × Σ → Q">
        total — every pair defined; unlisted pairs go to DEAD, which loops on all of Σ. See the δ table.
      </Row>
      <Row name="q₀">
        <Chip text="START" on={q === "START"} />
      </Row>
      <Row name={`F — ${Object.keys(ACCEPTING).length} accepting states (with action)`}>
        {Object.entries(ACCEPTING).map(([s, a]) => (
          <div key={s} style={{ display: "flex", justifyContent: "space-between", gap: 6, color: s === q ? colors.textPrimary : undefined }}>
            <span style={{ color: s === q ? colors.nodeActive : undefined }}>{s}</span>
            <span style={{ color: a !== "discard" && "error" in a ? colors.error : colors.accent }}>{actionLabel(a)}</span>
          </div>
        ))}
      </Row>
    </div>
  );
}
