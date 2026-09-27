import { useEffect } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { PhaseId } from "../compiler/trace";
import { INTRO_CARDS } from "../compiler/messages/intro";
import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";

interface IntroCardProps {
  phase: PhaseId;
  open: boolean;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: colors.textSecondary, marginBottom: 2 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.45, color: colors.textPrimary }}>{children}</div>
    </div>
  );
}

// Theory primer for one phase. Absolutely positioned so it covers only the
// pane it's mounted in (like ZoomTransition), never the right-hand panel.
// Dismiss with ✕, Escape, or a click on the backdrop.
export function IntroCard({ phase, open, onClose }: IntroCardProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const c = INTRO_CARDS[phase];
  return (
    <div
      onClick={onClose}
      style={{ position: "absolute", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        key={phase}
        className="intro-card-in"
        role="dialog"
        aria-label={c.title}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "min(640px, 100%)",
          maxHeight: "100%",
          overflowY: "auto",
          background: colors.panelBackground,
          border: `1px solid ${colors.glassBorder}`,
          borderRadius: 14,
          boxShadow: "0 16px 50px rgba(0,0,0,0.5)",
          padding: "16px 20px",
          fontFamily: fonts.base,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ position: "absolute", top: 10, right: 10, background: "transparent", border: "none", color: colors.textSecondary, fontSize: 16, cursor: "pointer" }}
        >
          {"✕"}
        </button>
        <div style={{ fontFamily: fonts.mono, fontSize: 16, fontWeight: 700, color: colors.textPrimary, paddingRight: 24 }}>{c.title}</div>
        <Section title="What this phase does">{c.does}</Section>
        <Section title="Machine / model">{c.model}</Section>
        <div style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.accent }}>
          {c.input} {"→"} {c.output}
        </div>
        <Section title="Why the previous phase can't do this">{c.whyNeeded}</Section>
        {c.sketch && (
          <pre
            style={{
              margin: 0,
              padding: "8px 10px",
              background: colors.codeBg,
              borderRadius: 8,
              fontFamily: fonts.mono,
              fontSize: 11.5,
              lineHeight: 1.5,
              color: colors.codeForeground,
              whiteSpace: "pre-wrap",
            }}
          >
            {c.sketch.join("\n")}
          </pre>
        )}
      </div>
    </div>
  );
}

// Small "?" that re-opens the phase's intro card after it was dismissed.
export function IntroButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="What is this phase? (theory primer)"
      style={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        background: colors.glass,
        border: `1px solid ${colors.glassBorder}`,
        color: colors.textPrimary,
        fontFamily: fonts.mono,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        backdropFilter: "blur(14px)",
        flexShrink: 0,
      }}
    >
      ?
    </button>
  );
}
