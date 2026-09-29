import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";
import type { PhaseResult } from "../../compiler/trace";
import type { VmOutput, VmStep } from "../../compiler/vm";

interface VmViewProps {
  result: PhaseResult<VmStep, VmOutput>;
  index: number;
}

const card = {
  background: colors.panelBackground, border: `1px solid ${colors.border}`, borderRadius: 10,
  padding: "10px 12px", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" as const,
};
const label = { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.base, marginBottom: 6 };
const mono = { fontFamily: fonts.mono, fontSize: 12, overflowY: "auto" as const, flex: 1, minHeight: 0 };
const cell = { border: `1px solid ${colors.border}`, borderRadius: 6, padding: "3px 8px", whiteSpace: "pre" as const, overflow: "hidden", textOverflow: "ellipsis" };

function Card({ title, children }: { title: string; children: ComponentChildren }) {
  return <div style={card}><div style={label}>{title}</div><div style={mono}>{children}</div></div>;
}

// Phase 7 view: the machine state after the current instruction — operand
// stack (top first), call-frame stack, the top frame's locals, the heap
// (objects the instruction touched are outlined), and the console. The
// right panel shows the same instruction in the dis listing.
export function VmView({ result, index }: VmViewProps) {
  const step = result.trace[index];
  const top = step.frames[step.frames.length - 1];
  const consoleRef = useRef<HTMLDivElement>(null);
  useEffect(() => consoleRef.current?.scrollIntoView({ block: "nearest" }), [step.output.length]);

  return (
    <div style={{ position: "absolute", inset: 0, padding: "8px 16px", display: "flex", flexDirection: "column", gap: 12, color: colors.textPrimary }}>
      <div style={{ fontFamily: fonts.mono, fontSize: 15, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <span style={{ color: colors.textSecondary, fontFamily: fonts.base, fontSize: 12 }}>executed #{index + 1}</span>
        <span style={{ color: step.error ? colors.error : colors.nodeActive }}>{step.opname}</span>
        {step.argrepr && <span style={{ color: colors.codeString }}>{step.argrepr}</span>}
        <span style={{ color: colors.textSecondary, fontSize: 12 }}>in {step.code} · pc {step.pc} · line {step.line}</span>
      </div>
      {step.error && <div style={{ color: colors.error, fontSize: 13 }}>{step.error}</div>}

      <div className="rsp-grid3" style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
        <Card title={`Operand stack (${step.stack.length}) — top first`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {step.stack.length === 0 && <span style={{ color: colors.textSecondary }}>(empty)</span>}
            {[...step.stack].reverse().map((v, i) => (
              <div key={step.stack.length - i} style={{ ...cell, borderColor: i === 0 ? colors.nodeActive : colors.border }}>{v}</div>
            ))}
          </div>
        </Card>
        <Card title={`Call frames (${step.frames.length}) — top first`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[...step.frames].reverse().map((f, i) => (
              <div key={step.frames.length - i} style={{ ...cell, borderColor: i === 0 ? colors.nodeActive : colors.border }}>
                {f.code} <span style={{ color: colors.textSecondary }}>pc {f.pc}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title={`Locals of ${top.code}`}>
          {top.locals.length === 0 && <span style={{ color: colors.textSecondary }}>(no slots)</span>}
          {top.locals.map((l, i) => (
            <div key={i} style={{ whiteSpace: "pre" }}>
              <span style={{ color: colors.codeLineNumber }}>{String(i).padStart(2)} </span>
              <span style={{ color: colors.typeBadge }}>{l.name}</span> = {l.value}
            </div>
          ))}
        </Card>
        <Card title={`Heap (${step.heap.length}) — stack & locals hold #refs`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {step.heap.length === 0 && <span style={{ color: colors.textSecondary }}>(empty)</span>}
            {step.heap.map((h) => (
              <div key={h.id} title={h.value} style={{ ...cell, borderColor: step.touched.includes(h.id) ? colors.nodeActive : colors.border }}>
                <span style={{ color: colors.codeLineNumber }}>#{h.id} </span>
                <span style={{ color: colors.typeBadge }}>{h.kind}</span> {h.value}
              </div>
            ))}
          </div>
        </Card>
        <div style={{ gridColumn: "2 / span 2", ...card }}>
          <div style={label}>Console</div>
          <div style={{ ...mono, background: colors.codeBg, borderRadius: 6, padding: "6px 10px" }}>
            {step.output.map((line, i) => <div key={i} style={{ whiteSpace: "pre-wrap" }}>{line}</div>)}
            <div ref={consoleRef} style={{ color: colors.textSecondary }}>{step.error ? "✗ halted with an error" : "▌"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
