import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";
import type { ScopeView, SemStep } from "../../compiler/semantic";
import { badge } from "./astGraph";

// The symbol table as a stack of scope cards, drawn top-of-stack first.
// On an exit-scope step the just-popped scope is still drawn (dashed, faded)
// above the stack so the pop is visible, not just an absence.
export function ScopeStack({ step }: { step: SemStep }) {
  const top = step.scopes.length - 1;
  const pushed = step.action === "enter-scope";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8 }}>
      <div style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary }}>
        symbol table (top ↓ bottom)
      </div>
      {step.popped && <ScopeCard scope={step.popped} tag="popped" tone="popped" />}
      {step.scopes.map((s, i) => ({ s, i })).reverse().map(({ s, i }) => (
        <ScopeCard key={i} scope={s} tag={i === top ? (pushed ? "pushed · top" : "top") : undefined} tone={i === top ? "top" : "normal"} />
      ))}
    </div>
  );
}

function ScopeCard({ scope, tag, tone }: { scope: ScopeView; tag?: string; tone: "top" | "normal" | "popped" }) {
  const border = tone === "top" ? colors.nodeActive : colors.nodeIdleBorder;
  return (
    <div
      style={{
        border: `1.5px ${tone === "popped" ? "dashed" : "solid"} ${border}`,
        borderRadius: 7,
        background: colors.nodeIdle,
        boxShadow: tone === "top" ? `0 0 10px ${colors.nodeActiveGlow}` : "none",
        opacity: tone === "popped" ? 0.5 : 1,
        padding: "5px 8px",
        fontFamily: fonts.mono,
        fontSize: 12,
        color: colors.textPrimary,
        transition: "box-shadow 0.2s ease, border-color 0.2s ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", color: colors.textSecondary, fontSize: 11, marginBottom: 3 }}>
        <span style={{ fontWeight: 700 }}>{scope.kind}</span>
        {tag && <span style={{ color: tone === "top" ? colors.nodeActive : colors.textSecondary }}>{tag}</span>}
      </div>
      {scope.entries.length === 0 && <div style={{ color: colors.textSecondary, opacity: 0.6 }}>(empty)</div>}
      {scope.entries.map((e) => (
        <div key={e.name} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {e.name} <span style={{ color: colors.textSecondary }}>:</span>{" "}
          <span style={{ color: colors.typeBadge }}>{badge(e.type)}</span>
          {e.slot >= 0 && <span style={{ color: colors.textSecondary }}> @{e.slot}</span>}
        </div>
      ))}
    </div>
  );
}
