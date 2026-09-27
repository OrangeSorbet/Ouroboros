import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";

interface CodePanelProps {
  source: string | null;
  currentLine?: number;
  currentCol?: number;
  currentColEnd?: number; // inclusive; defaults to currentCol (single char)
  filename?: string | null;
  onChange?: (text: string) => void;
}

interface Segment {
  text: string;
  color: string;
  italic?: boolean;
}

const TOKEN_RE = /(#.*)|(\b(?:let|print|if|else|while|true|false)\b)|(\b\d+\b)|([a-zA-Z_]\w*)|(\s+)|([^\sA-Za-z0-9_]+)/g;

function highlightLine(line: string): Segment[] {
  const segments: Segment[] = [];
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(line))) {
    if (m[1] !== undefined) segments.push({ text: m[1], color: colors.codeComment, italic: true });
    else if (m[2] !== undefined) segments.push({ text: m[2], color: colors.codeKeyword });
    else if (m[3] !== undefined) segments.push({ text: m[3], color: colors.codeNumber });
    else if (m[4] !== undefined) segments.push({ text: m[4], color: colors.codeForeground });
    else if (m[5] !== undefined) segments.push({ text: m[5], color: colors.codeForeground });
    else if (m[6] !== undefined) segments.push({ text: m[6], color: colors.codeOperator });
  }
  return segments;
}

// Renders a line's highlighted segments, splitting any segment that
// overlaps [activeStart, activeEnd] (1-based, inclusive) into up to three
// pieces so the exact highlighted span gets its own glyph-level span —
// this highlights the real characters directly instead of a
// separately-positioned overlay box that can drift out of alignment with
// actual (font-dependent) glyph widths. A single character (the lexer's
// case) is just a span where start === end; a whole token (the parser's
// case) spans multiple characters, possibly across multiple regex segments
// (e.g. "==" tokenizes as one punctuation run, but "x" beside "+" doesn't).
function renderLine(line: string, activeStart?: number, activeEnd?: number) {
  const segments = highlightLine(line);
  const nodes: ComponentChildren[] = [];
  const hasRange = activeStart != null && activeEnd != null;
  let col = 1;
  segments.forEach((s, j) => {
    const start = col;
    const end = col + s.text.length - 1;
    const base = { color: s.color, fontStyle: s.italic ? "italic" as const : "normal" as const };
    const overlapStart = hasRange ? Math.max(start, activeStart!) : -1;
    const overlapEnd = hasRange ? Math.min(end, activeEnd!) : -1;
    if (!hasRange || overlapStart > overlapEnd) {
      nodes.push(<span key={j} style={base}>{s.text}</span>);
    } else {
      const before = s.text.slice(0, overlapStart - start);
      const mid = s.text.slice(overlapStart - start, overlapEnd - start + 1);
      const after = s.text.slice(overlapEnd - start + 1);
      if (before) nodes.push(<span key={`${j}a`} style={base}>{before}</span>);
      nodes.push(
        <span
          key={`${j}b`}
          style={{ ...base, background: colors.nodeActiveGlow, outline: `1px solid ${colors.nodeActive}`, borderRadius: 2 }}
        >
          {mid}
        </span>
      );
      if (after) nodes.push(<span key={`${j}c`} style={base}>{after}</span>);
    }
    col = end + 1;
  });
  return nodes;
}

const LINE_HEIGHT = 20;
const FONT_SIZE = 13;

// Editable: a transparent <textarea> sits directly on top of the
// syntax-highlighted <pre>, sharing identical font metrics/padding, so
// typing edits the real text while the colors show through underneath —
// the standard "highlight behind a transparent textarea" technique.
export function CodePanel({ source, currentLine, currentCol, currentColEnd, filename, onChange }: CodePanelProps) {
  // Draft is local — typing only edits this buffer. Recompiling on every
  // keystroke re-lexed half-typed tokens and threw confusing errors mid-word,
  // so the actual source only updates when the user hits Save (or Ctrl/Cmd+Enter).
  const [draft, setDraft] = useState(source ?? "");
  useEffect(() => setDraft(source ?? ""), [source]);

  const dirty = draft !== (source ?? "");
  const save = () => onChange?.(draft);

  // Drag-to-resize: width lives in state, updated live from mousemove while
  // dragging the strip on the panel's left edge (mirrors a normal editor's
  // sidebar-resize handle rather than adding a wrap mode that would break
  // the line-number/highlight alignment, which assumes one source line = one row).
  const [width, setWidth] = useState(380);
  const dragging = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setWidth((w) => Math.min(900, Math.max(260, w - e.movementX)));
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const text = draft;
  const lines = text.split("\n");

  const sharedTextStyle = {
    margin: 0,
    padding: "10px 12px",
    fontFamily: fonts.mono,
    fontSize: FONT_SIZE,
    lineHeight: `${LINE_HEIGHT}px`,
    whiteSpace: "pre" as const,
    wordWrap: "normal" as const,
  };

  return (
    <div
      style={{
        width,
        flexShrink: 0,
        height: "100vh",
        position: "relative",
        background: colors.codeBg,
        borderLeft: `1px solid ${colors.border}`,
        boxShadow: "-8px 0 24px rgba(0,0,0,0.25)",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <div
        onMouseDown={() => { dragging.current = true; }}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: -3,
          width: 6,
          cursor: "col-resize",
          zIndex: 40,
        }}
      />
      <div
        style={{
          height: 70,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 16px",
          borderBottom: `1px solid ${colors.border}`,
          background: colors.panelBackground,
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f56" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ffbd2e" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#27c93f" }} />
        </div>
        <span style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.textSecondary, flex: 1 }}>
          {filename ?? "source.snek"}{dirty ? " •" : ""}
        </span>
        <button
          onClick={save}
          disabled={!dirty}
          title="Save and recompile (Ctrl+Enter)"
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            padding: "4px 10px",
            borderRadius: 6,
            border: `1px solid ${dirty ? colors.nodeActive : colors.border}`,
            background: dirty ? colors.nodeActiveGlow : "transparent",
            color: dirty ? colors.textPrimary : colors.textSecondary,
            cursor: dirty ? "pointer" : "default",
            opacity: dirty ? 1 : 0.5,
          }}
        >
          Save
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", display: "flex" }}>
          <div style={{ flexShrink: 0, userSelect: "none" }}>
            {lines.map((_, i) => {
              const isActive = i + 1 === currentLine;
              return (
                <div
                  key={i}
                  style={{
                    height: LINE_HEIGHT,
                    lineHeight: `${LINE_HEIGHT}px`,
                    padding: "0 10px 0 14px",
                    textAlign: "right",
                    fontFamily: fonts.mono,
                    fontSize: FONT_SIZE,
                    color: colors.codeLineNumber,
                    background: isActive ? colors.codeLineHighlight : "transparent",
                    borderLeft: isActive ? `3px solid ${colors.nodeActive}` : "3px solid transparent",
                    marginTop: i === 0 ? 10 : 0,
                    transition: "background 0.15s ease",
                  }}
                >
                  {i + 1}
                </div>
              );
            })}
          </div>

          <div style={{ position: "relative", flex: 1, minHeight: "100%" }}>
            {currentLine != null && currentLine > 0 && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 10 + (currentLine - 1) * LINE_HEIGHT,
                  height: LINE_HEIGHT,
                  background: colors.codeLineHighlight,
                  pointerEvents: "none",
                }}
              />
            )}
            <pre style={{ ...sharedTextStyle, position: "relative", color: colors.codeForeground, pointerEvents: "none" }}>
              {lines.map((line, i) => (
                <div key={i} style={{ height: LINE_HEIGHT }}>
                  {renderLine(
                    line,
                    i + 1 === currentLine ? currentCol : undefined,
                    i + 1 === currentLine ? (currentColEnd ?? currentCol) : undefined
                  )}
                  {line.length === 0 ? " " : null}
                </div>
              ))}
            </pre>
            <textarea
              value={text}
              spellcheck={false}
              onInput={(e: any) => setDraft(e.currentTarget.value)}
              onKeyDown={(e: any) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
              style={{
                ...sharedTextStyle,
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                background: "transparent",
                color: "transparent",
                caretColor: colors.textPrimary,
                border: "none",
                outline: "none",
                resize: "none",
                overflow: "hidden",
              }}
            />
          </div>
        </div>
    </div>
  );
}
