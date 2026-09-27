import { PDA_EDGES, activePdaEdgeKey, edgeKey } from "../compiler/pda";
import type { PdaStep } from "../compiler/parser";
import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";

interface PdaTransitionTableProps {
  step?: PdaStep;
}

// A formal PDA transition is a 5-tuple: delta(state, input, stack-top) =
// (state', push) — here: From (current rule / stack-top), Trigger (the
// lookahead that selects this production), Push (the rule entered), Pop-to
// (who control returns to, i.e. From again), and Kind (call vs. recurse).
export function PdaTransitionTable({ step }: PdaTransitionTableProps) {
  const activeKey = activePdaEdgeKey(step);

  return (
    <div
      style={{
        position: "absolute",
        top: 128,
        left: 16,
        zIndex: 25,
        width: 320,
        maxHeight: "60vh",
        overflowY: "auto",
        background: colors.panelBackground,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        fontFamily: fonts.mono,
        fontSize: 10.5,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 0.8fr", gap: 4, padding: "8px 10px", borderBottom: `1px solid ${colors.border}`, color: colors.textSecondary }}>
        <span>from</span>
        <span>trigger</span>
        <span>push</span>
        <span>pop to</span>
        <span>kind</span>
      </div>
      {PDA_EDGES.map((e) => {
        const key = edgeKey(e.from, e.to);
        const isActive = activeKey === key;
        return (
          <div
            key={key}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr 0.8fr",
              gap: 4,
              padding: "4px 10px",
              background: isActive ? colors.codeLineHighlight : "transparent",
              borderLeft: isActive ? `3px solid ${colors.nodeActive}` : "3px solid transparent",
              color: isActive ? colors.textPrimary : colors.textSecondary,
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.from}</span>
            <span style={{ opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.trigger}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.to}</span>
            <span style={{ opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.from}</span>
            <span style={{ opacity: 0.6 }}>{e.recurse ? "recurse" : "call"}</span>
          </div>
        );
      })}
    </div>
  );
}
