import type { ComponentChildren } from "preact";
import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";
import type { PhaseResult } from "../../compiler/trace";
import type { AsmStep, BytecodeProgram } from "../../compiler/bytecode";
import { hexBytes } from "../../compiler/bytecode";

interface AsmViewProps {
  result: PhaseResult<AsmStep, BytecodeProgram>;
  index: number;
}

const card = {
  background: colors.panelBackground, border: `1px solid ${colors.border}`, borderRadius: 10,
  padding: "10px 12px", minWidth: 0,
};
const label = { fontSize: 11, color: colors.textSecondary, fontFamily: fonts.base, marginBottom: 6 };

function Table({ title, items, show }: { title: string; items: string[]; show: boolean }) {
  return (
    <div style={{ ...card, opacity: show ? 1 : 0.3, transition: "opacity 0.3s" }}>
      <div style={label}>{title}</div>
      <div style={{ fontFamily: fonts.mono, fontSize: 12, maxHeight: 180, overflowY: "auto" }}>
        {!show ? "…" : items.length === 0 ? <span style={{ color: colors.textSecondary }}>(empty)</span> : items.map((v, i) => (
          <div key={i} style={{ whiteSpace: "pre" }}>
            <span style={{ color: colors.codeLineNumber }}>{String(i).padStart(2)} </span>{v}
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return <div style={card}><div style={label}>{title}</div>{children}</div>;
}

// Phase 6 view: the code object's tables (co_consts / co_names /
// co_varnames), the label → offset resolution, the jump-size fixpoint, and
// the current instruction's encoding as IR → opcode/arg → bytes.
export function AsmView({ result, index }: AsmViewProps) {
  const step = result.trace[index];
  const t = step.tables;
  const enc = step.encoding;
  return (
    <div style={{ position: "absolute", inset: 0, overflowY: "auto", padding: "8px 16px", display: "flex", flexDirection: "column", gap: 12, color: colors.textPrimary }}>
      <div style={{ fontFamily: fonts.base, fontSize: 14 }}>
        Code object <span style={{ fontFamily: fonts.mono, color: colors.nodeActive }}>{step.code}</span>
      </div>

      <div className="rsp-grid3" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <Table title="co_consts" items={t.consts} show={step.tablesShown >= 1} />
        <Table title="co_names (globals)" items={t.names} show={step.tablesShown >= 2} />
        <Table title="co_varnames (slots)" items={t.varnames} show={step.tablesShown >= 3} />
      </div>

      {enc && (
        <Section title="Encoding">
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontFamily: fonts.mono, fontSize: 16 }}>
            <span>{enc.ir}</span>
            <span style={{ color: colors.textSecondary }}>⟶</span>
            <span>
              opcode <span style={{ color: colors.codeKeyword }}>0x{enc.opnum.toString(16).toUpperCase().padStart(2, "0")}</span>, arg{" "}
              <span style={{ color: colors.codeNumber }}>{enc.arg}</span>
              {enc.offsetNote && <span style={{ color: colors.warning }}> ({enc.offsetNote} units)</span>}
            </span>
            <span style={{ color: colors.textSecondary }}>⟶</span>
            <span style={{ color: colors.accent, fontWeight: 600 }}>{hexBytes(enc.bytes)}</span>
          </div>
        </Section>
      )}

      {step.action === "fixpoint" && (
        <Section title={`Jump sizing — pass ${step.iteration}`}>
          <div style={{ fontSize: 13, color: step.grew ? colors.warning : colors.accent }}>
            {step.grew
              ? `${step.grew} instruction(s) needed EXTENDED_ARG — offsets shift, measure again`
              : "no instruction grew — sizes are final (fixpoint)"}
          </div>
        </Section>
      )}

      {step.labelMap && step.labelMap.length > 0 && (
        <Section title="Labels → offsets">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontFamily: fonts.mono, fontSize: 12 }}>
            {step.labelMap.map((l) => (
              <span key={l.label} style={{ border: `1px solid ${colors.border}`, borderRadius: 6, padding: "2px 8px" }}>
                L{l.label} → unit {l.unit} · byte {l.offset}
              </span>
            ))}
          </div>
        </Section>
      )}

      {step.action === "error" && <div style={{ color: colors.error, fontSize: 13 }}>{result.error?.message}</div>}
    </div>
  );
}
