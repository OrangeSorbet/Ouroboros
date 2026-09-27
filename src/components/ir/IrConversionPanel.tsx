import { useEffect, useRef } from "preact/hooks";
import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";
import type { PhaseResult } from "../../compiler/trace";
import { formatInstr } from "../../compiler/irTypes";
import type { IrProgram } from "../../compiler/irTypes";
import type { IrGenInstr, IrGenStep } from "../../compiler/irgen";

interface IrConversionPanelProps {
  result: PhaseResult<IrGenStep, IrProgram>;
  index: number;
  source: string;
}

const box = { flex: 1, minHeight: 0, overflowY: "auto" as const, padding: "6px 0", fontFamily: fonts.mono, fontSize: 12 };
const head = { padding: "6px 12px", fontSize: 11, color: colors.textSecondary, borderBottom: `1px solid ${colors.border}`, fontFamily: fonts.base };

// Phase 4 right panel: source on top (translated lines dimmed, current
// statement highlighted), the growing IR list of the current code object
// below. Pending forward jumps read "→ ?" until their label is backpatched.
export function IrConversionPanel({ result, index, source }: IrConversionPanelProps) {
  const step = result.trace[index];
  const lines = source.split("\n");
  let reached = 0;
  const placed = new Set<number>();
  for (let i = 0; i <= index; i++) {
    const s = result.trace[i];
    if (s.span) reached = Math.max(reached, s.span.line);
    if (s.code === step.code && s.label !== undefined) placed.add(s.label);
  }
  const cur = step.span;
  const code = step.codeRef;
  const labelsAt = new Map<number, number[]>();
  placed.forEach((l) => labelsAt.set(code.labels[l], [...(labelsAt.get(code.labels[l]) ?? []), l]));

  const text = (ins: IrGenInstr) =>
    ins.pending ? `${ins.op} → ?` : ins.target !== undefined ? `${ins.op} → L${ins.target}` : formatInstr(ins, code);

  const activeRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
    lineRef.current?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const labelRow = (at: number) =>
    (labelsAt.get(at) ?? []).map((l) => (
      <div key={`L${l}`} style={{ padding: "0 12px", color: colors.warning }}>L{l}:</div>
    ));

  return (
    <div style={{ width: 420, flexShrink: 0, height: "100vh", display: "flex", flexDirection: "column", background: colors.codeBg, borderLeft: `1px solid ${colors.border}`, color: colors.codeForeground }}>
      <div style={head}>source</div>
      <div style={box}>
        {lines.map((l, i) => {
          const n = i + 1;
          const active = cur && n >= cur.line && n <= cur.endLine;
          return (
            <div
              key={n}
              ref={cur && n === cur.line ? lineRef : undefined}
              style={{ display: "flex", whiteSpace: "pre", background: active ? colors.codeLineHighlight : undefined, opacity: !active && n < reached ? 0.35 : 1 }}
            >
              <span style={{ width: 34, textAlign: "right", paddingRight: 10, color: colors.codeLineNumber }}>{n}</span>
              <span>{l}</span>
            </div>
          );
        })}
      </div>
      <div style={{ ...head, borderTop: `1px solid ${colors.border}` }}>IR — code object {step.code}</div>
      <div style={box}>
        {step.instrs.map((ins, i) => {
          const isNew = i === step.emittedIndex;
          const isPatched = step.patched?.includes(i);
          return (
            <div key={i}>
              {labelRow(i)}
              <div
                ref={isNew || isPatched ? activeRef : undefined}
                style={{
                  display: "flex", padding: "0 12px", whiteSpace: "pre",
                  background: isNew ? colors.nodeActiveGlow : isPatched ? colors.diffAdded : undefined,
                  color: ins.pending ? colors.warning : colors.codeForeground,
                }}
              >
                <span style={{ width: 30, color: colors.codeLineNumber }}>{i}</span>
                <span>{text(ins)}</span>
              </div>
            </div>
          );
        })}
        {labelRow(step.instrs.length)}
        {step.action === "error" && (
          <div style={{ margin: 8, color: colors.error }}>{result.error?.message}</div>
        )}
      </div>
    </div>
  );
}
