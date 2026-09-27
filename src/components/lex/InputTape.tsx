import type { DfaStep } from "../../compiler/lexer";
import { showChar } from "../../compiler/messages/lex";
import { currentState } from "./FiveTuple";
import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";

interface InputTapeProps {
  source: string;
  step: DfaStep;
}

const CELL = 18;
const WINDOW = 72; // cells shown at once; long lines scroll with the head

// The textbook DFA picture: one row of cells (the current source line) and a
// read head. The head sits on `step.offset`; on a no-move it stays on the
// refused char, which is how "lookahead, not consumed" is shown without any
// extra UI. Cells of the lexeme being matched are shaded.
export function InputTape({ source, step }: InputTapeProps) {
  const lines = source.split("\n");
  const lineIdx = step.line - 1;
  const text = lines[lineIdx] ?? "";
  const lineStart = step.offset - (step.col - 1);
  // The newline is a real tape symbol; the last line ends at EOF instead.
  const cells = [...text, lineIdx < lines.length - 1 ? "\n" : ""];
  const head = step.col - 1;
  const from = Math.max(0, Math.min(head - WINDOW / 2, cells.length - WINDOW));
  const shown = cells.slice(from, from + WINDOW);

  // Consumed part of the current lexeme: a move has just read `offset`.
  const lexEnd = step.kind === "move" ? step.offset + 1 : step.offset;
  const noMove = step.kind === "no-move";
  const headColor = step.kind === "error" ? colors.error : colors.nodeActive;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 10px 2px", borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
      <div style={{ fontFamily: fonts.mono, fontSize: 10.5, color: colors.textSecondary, width: 150, flexShrink: 0, lineHeight: 1.5 }}>
        <div>line {step.line} · col {step.col}</div>
        <div>
          state <span style={{ color: colors.textPrimary }}>{currentState(step)}</span>
        </div>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          lexeme <span style={{ color: colors.accent }}>"{step.lexemeSoFar}"</span>
        </div>
      </div>
      <div style={{ overflow: "hidden", minWidth: 0 }}>
        <div style={{ display: "flex" }}>
          {shown.map((ch, k) => {
            const i = from + k;
            const off = lineStart + i;
            const inLexeme = off >= step.start && off < lexEnd;
            const isHead = i === head;
            return (
              <div
                key={i}
                style={{
                  width: CELL,
                  height: CELL + 4,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: fonts.mono,
                  fontSize: ch.length === 1 && ch !== " " ? 12 : 8.5,
                  border: `1px solid ${isHead ? headColor : colors.border}`,
                  borderStyle: isHead && noMove ? "dashed" : "solid",
                  marginLeft: k === 0 ? 0 : -1,
                  position: "relative",
                  zIndex: isHead ? 1 : 0,
                  background: inLexeme ? colors.codeLineHighlight : colors.codeBg,
                  color: isHead && step.kind === "error" ? colors.error : inLexeme ? colors.textPrimary : colors.textSecondary,
                }}
              >
                {ch === " " ? "" : showChar(ch)}
              </div>
            );
          })}
        </div>
        <div style={{ position: "relative", height: 14 }}>
          <span style={{ position: "absolute", left: (head - from) * (CELL - 1) + CELL / 2 - 5, top: -1, color: headColor, fontSize: 11, lineHeight: 1 }}>▲</span>
          {noMove && (
            <span style={{ position: "absolute", left: (head - from) * (CELL - 1) + CELL + 4, top: 1, color: colors.nodeActive, fontFamily: fonts.mono, fontSize: 9.5, whiteSpace: "nowrap" }}>
              lookahead — not consumed
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
