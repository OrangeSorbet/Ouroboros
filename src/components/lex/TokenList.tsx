import { useEffect, useRef } from "preact/hooks";
import type { DfaStep } from "../../compiler/lexer";
import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";

// The lexer's output so far, in source order — what the parser will read.
export function TokenList({ trace, index }: { trace: DfaStep[]; index: number }) {
  const emitted = trace.slice(0, index + 1).flatMap((s) => (s.token ? [s.token] : []));
  const justEmitted = trace[index].token !== undefined;
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ block: "nearest" }), [emitted.length]);

  return (
    <div style={{ fontFamily: fonts.mono, fontSize: 10.5 }}>
      {emitted.length === 0 && <div style={{ padding: 10, color: colors.textSecondary }}>no tokens yet</div>}
      {emitted.map((t, i) => {
        const latest = justEmitted && i === emitted.length - 1;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 8,
              padding: "2px 10px",
              background: latest ? colors.codeLineHighlight : "transparent",
              borderLeft: `3px solid ${latest ? colors.nodeActive : "transparent"}`,
              color: latest ? colors.textPrimary : colors.textSecondary,
            }}
          >
            <span style={{ color: colors.accent, width: 64, flexShrink: 0 }}>{t.kind}</span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.kind === "EOF" ? "$" : t.lexeme}</span>
            <span style={{ opacity: 0.6 }}>{t.line}:{t.col}</span>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
