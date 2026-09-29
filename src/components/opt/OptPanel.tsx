import { useEffect, useRef } from "preact/hooks";
import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";
import type { PhaseResult } from "../../compiler/trace";
import type { OptOutput, OptStep } from "../../compiler/optimize";
import { blockColor } from "./blockColors";

interface OptPanelProps {
  result: PhaseResult<OptStep, OptOutput>;
  index: number;
}

// Phase 5 right panel: the IR of the current code object, grouped and
// coloured by basic block, with the current rewrite's diff folded in
// (removed struck through, new highlighted).
export function OptPanel({ result, index }: OptPanelProps) {
  const step = result.trace[index];
  const firstChange = step.rows.findIndex((r) => r.kind !== "same");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.scrollIntoView({ block: "nearest" }), [index]);

  return (
    <div style={{ width: 420, flexShrink: 0, height: "100%", display: "flex", flexDirection: "column", background: colors.codeBg, borderLeft: `1px solid ${colors.border}`, color: colors.codeForeground }}>
      <div style={{ padding: "6px 12px", fontSize: 11, color: colors.textSecondary, borderBottom: `1px solid ${colors.border}`, fontFamily: fonts.base }}>
        IR — code object {step.code} · {step.instrsAfter.length} instructions
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 0", fontFamily: fonts.mono, fontSize: 12 }}>
        {step.rows.map((r, i) => {
          const header = i === 0 || step.rows[i - 1].block !== r.block;
          return (
            <div key={i} ref={i === firstChange ? ref : undefined}>
              {header && r.block >= 0 && step.action !== "leaders" && (
                <div style={{ padding: "4px 12px 0", fontSize: 10, color: blockColor(r.block) }}>B{r.block}</div>
              )}
              <div
                style={{
                  padding: "0 12px", whiteSpace: "pre", borderLeft: `3px solid ${blockColor(r.block)}`,
                  background: r.kind === "removed" ? colors.diffRemoved : r.kind === "added" ? colors.diffAdded : r.block === step.activeBlock ? colors.codeLineHighlight : undefined,
                  textDecoration: r.kind === "removed" ? "line-through" : undefined,
                  color: r.kind === "removed" ? colors.textSecondary : colors.codeForeground,
                }}
              >
                {r.kind === "added" ? "+ " : r.kind === "removed" ? "- " : "  "}{r.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
