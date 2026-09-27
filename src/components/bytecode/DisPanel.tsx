import { useEffect, useRef } from "preact/hooks";
import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";
import type { DisRow } from "../../compiler/bytecode";
import { hexBytes } from "../../compiler/bytecode";

interface DisPanelProps {
  title: string;
  rows: DisRow[];
  activeOffset?: number; // byte offset of the highlighted row (current encode / PC)
  error?: boolean;
}

// Phases 6–7 right panel: a CPython `dis`-style listing (line, offset,
// opname, arg, resolved value) with each instruction's raw bytes under it.
// Phase 6 shows it growing; phase 7 highlights the program counter.
export function DisPanel({ title, rows, activeOffset, error }: DisPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.scrollIntoView({ block: "nearest" }), [activeOffset, rows]);

  return (
    <div style={{ width: 420, flexShrink: 0, height: "100vh", display: "flex", flexDirection: "column", background: colors.codeBg, borderLeft: `1px solid ${colors.border}`, color: colors.codeForeground }}>
      <div style={{ padding: "6px 12px", fontSize: 11, color: colors.textSecondary, borderBottom: `1px solid ${colors.border}`, fontFamily: fonts.base }}>
        {title}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 0", fontFamily: fonts.mono, fontSize: 12 }}>
        {rows.length === 0 && <div style={{ padding: "0 12px", color: colors.textSecondary }}>no instructions yet</div>}
        {rows.map((r, i) => {
          const active = r.offset === activeOffset;
          const newLine = i === 0 || rows[i - 1].line !== r.line;
          return (
            <div
              key={r.offset}
              ref={active ? ref : undefined}
              style={{
                padding: "1px 12px",
                borderLeft: `3px solid ${active ? (error ? colors.error : colors.nodeActive) : "transparent"}`,
                background: active ? colors.codeLineHighlight : undefined,
              }}
            >
              <div style={{ whiteSpace: "pre" }}>
                <span style={{ color: colors.codeLineNumber }}>{(newLine ? String(r.line) : "").padStart(3)} {String(r.offset).padStart(4)} </span>
                <span style={{ color: colors.codeKeyword }}>{r.opname.padEnd(21)}</span>
                <span style={{ color: colors.codeNumber }}>{r.arg === null ? "   " : String(r.arg).padStart(3)}</span>
                {r.argrepr && <span style={{ color: colors.codeString }}> ({r.argrepr})</span>}
              </div>
              <div style={{ whiteSpace: "pre", fontSize: 10, color: colors.textSecondary, paddingLeft: 72 }}>{hexBytes(r.bytes)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
