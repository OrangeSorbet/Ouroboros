import { useEffect, useMemo, useState } from "preact/hooks";
import { Navbar } from "./components/Navbar";
import { Scrubber, speedToIntervalMs, SCRUBBER_HEIGHT } from "./components/Scrubber";
import { CodePanel } from "./components/CodePanel";
import { PhaseFlowchart } from "./components/PhaseFlowchart";
import { IntroCard, IntroButton } from "./components/IntroCard";
import { ZoomTransition } from "./components/ZoomTransition";
import { LexView } from "./components/lex/LexView";
import { ParseView } from "./components/parse/ParseView";
import { SemanticView } from "./components/semantic/SemanticView";
import { IrGenView } from "./components/ir/IrGenView";
import { IrConversionPanel } from "./components/ir/IrConversionPanel";
import { OptView } from "./components/opt/OptView";
import { OptPanel } from "./components/opt/OptPanel";
import { AsmView } from "./components/bytecode/AsmView";
import { DisPanel } from "./components/bytecode/DisPanel";
import { VmView } from "./components/vm/VmView";
import { compile, IMPLEMENTED_PHASES } from "./compiler/pipeline";
import type { PipelineResult } from "./compiler/pipeline";
import type { PhaseId, PhaseResult, TraceStep } from "./compiler/trace";
import { colors } from "./styles/colors";
import "./styles/layout.css";
import "./app.css";

type ViewId = "flowchart" | PhaseId;

// Navbar (top 16, ~60 tall) + a 34px row for the back / intro buttons.
const VIEW_TOP = 118;
const SCRUBBER_PAD = 24;

const EMPTY_INDICES: Record<PhaseId, number> = { lex: 0, parse: 0, semantic: 0, ir: 0, opt: 0, bytecode: 0, vm: 0 };

function phaseResult(p: PipelineResult | null, id: PhaseId): PhaseResult<TraceStep, unknown> | undefined {
  if (!p) return undefined;
  if (id === "lex") return p.lex;
  if (id === "parse") return p.parse;
  if (id === "semantic") return p.semantic;
  if (id === "ir") return p.ir;
  if (id === "opt") return p.opt;
  if (id === "bytecode") return p.bytecode;
  return p.vm;
}

export function App() {
  const [filename, setFilename] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<PipelineResult | null>(null);
  const [indices, setIndices] = useState<Record<PhaseId, number>>(EMPTY_INDICES);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.5);
  const [view, setView] = useState<ViewId>("flowchart");
  const [introOpen, setIntroOpen] = useState(false);
  const [autoReturn, setAutoReturn] = useState(false);
  const [zoom, setZoom] = useState<{ from: ViewId; to: ViewId; origin: { x: number; y: number }; direction: "in" | "out" } | null>(null);

  const beginZoom = (from: ViewId, to: ViewId, origin: { x: number; y: number }) => {
    setPlaying(false);
    setZoom({ from, to, origin, direction: to === "flowchart" ? "out" : "in" });
  };

  const recompile = (text: string) => {
    setSource(text);
    setPlaying(false);
    setIndices(EMPTY_INDICES);
    setPipeline(compile(text));
  };

  const handleLoad = (text: string, name: string) => {
    setFilename(name);
    recompile(text);
  };

  // A phase is enabled once it has a trace (it ran, even if it failed);
  // completed once it succeeded and the user watched it to its last step.
  const enabledPhases = IMPLEMENTED_PHASES.filter((id) => (phaseResult(pipeline, id)?.trace.length ?? 0) > 0);
  const completedPhases = enabledPhases.filter((id) => {
    const r = phaseResult(pipeline, id)!;
    return r.ok && indices[id] >= r.trace.length - 1;
  });
  const flowchartActive: PhaseId = enabledPhases.find((id) => !completedPhases.includes(id)) ?? enabledPhases[enabledPhases.length - 1] ?? "lex";
  const errorPhase = pipeline?.errorPhase;
  const errorMessage = errorPhase ? phaseResult(pipeline, errorPhase)?.error?.message : undefined;

  const activeResult = view === "flowchart" ? undefined : phaseResult(pipeline, view);
  const activeIndex = view === "flowchart" ? 0 : indices[view];
  const activeStep = activeResult?.trace[activeIndex];
  const seek = (id: PhaseId, i: number) => setIndices((prev) => ({ ...prev, [id]: i }));

  useEffect(() => {
    if (!playing || view === "flowchart" || !activeResult) return;
    const intervalMs = speedToIntervalMs(speed);
    if (intervalMs === null) return; // speed 0 = manual
    if (activeIndex >= activeResult.trace.length - 1) {
      setPlaying(false);
      setAutoReturn(true);
      return;
    }
    const id = setTimeout(() => seek(view, Math.min(activeIndex + 1, activeResult.trace.length - 1)), intervalMs);
    return () => clearTimeout(id);
  }, [playing, activeIndex, activeResult, view, speed]);

  // Cinematic zoom-out once autoplay finishes a phase.
  useEffect(() => {
    if (!autoReturn) return;
    const id = setTimeout(() => {
      beginZoom(view, "flowchart", { x: window.innerWidth / 2, y: window.innerHeight / 2 });
      setAutoReturn(false);
    }, 900);
    return () => clearTimeout(id);
  }, [autoReturn]);

  function renderPhaseView(v: PhaseId, index: number) {
    if (!pipeline || !source) return null;
    if (v === "lex") return <LexView result={pipeline.lex} index={index} source={source} />;
    if (v === "parse" && pipeline.parse && pipeline.lex.output) {
      return <ParseView result={pipeline.parse} index={index} tokens={pipeline.lex.output} />;
    }
    if (v === "semantic" && pipeline.semantic && pipeline.parse?.output) {
      return <SemanticView result={pipeline.semantic} index={index} ast={pipeline.parse.output.ast} />;
    }
    if (v === "ir" && pipeline.ir && pipeline.parse?.output) {
      return <IrGenView result={pipeline.ir} index={index} ast={pipeline.parse.output.ast} />;
    }
    if (v === "opt" && pipeline.opt) return <OptView result={pipeline.opt} index={index} />;
    if (v === "bytecode" && pipeline.bytecode) return <AsmView result={pipeline.bytecode} index={index} />;
    if (v === "vm" && pipeline.vm) return <VmView result={pipeline.vm} index={index} />;
    return null;
  }

  // The left pane only. Reused for the live render AND both layers of the
  // zoom transition; the code panel is a permanent sibling outside it.
  function renderLeftPane(v: ViewId) {
    const r = v === "flowchart" ? undefined : phaseResult(pipeline, v);
    const i = v === "flowchart" ? 0 : indices[v];

    return (
      <div style={{ height: "100vh", width: "100%", position: "relative", overflow: "hidden", background: colors.background }}>
        {v === "flowchart" ? (
          <PhaseFlowchart
            activePhase={flowchartActive}
            completedPhases={completedPhases}
            enabledPhases={enabledPhases}
            errorPhase={errorPhase}
            errorMessage={errorMessage}
            onSelectPhase={(id, origin) => beginZoom(view, id, origin)}
          />
        ) : (
          <div style={{ position: "absolute", top: VIEW_TOP, left: 0, right: 0, bottom: SCRUBBER_HEIGHT + SCRUBBER_PAD }}>
            {r && r.trace.length > 0 && renderPhaseView(v, i)}
            <IntroCard phase={v} open={introOpen && v === view} onClose={() => setIntroOpen(false)} />
          </div>
        )}

        <Navbar filename={filename} tokenCount={pipeline?.lex.output?.length ?? 0} onLoad={handleLoad} />

        {v !== "flowchart" && (
          <div style={{ position: "absolute", top: 84, left: 16, zIndex: 30, display: "flex", gap: 8 }}>
            <button
              onClick={(e: any) => {
                const rect = e.currentTarget.getBoundingClientRect();
                beginZoom(view, "flowchart", { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
              }}
              style={{
                background: colors.glass,
                border: `1px solid ${colors.glassBorder}`,
                borderRadius: 8,
                color: colors.textPrimary,
                fontSize: 12,
                padding: "5px 12px",
                cursor: "pointer",
                backdropFilter: "blur(14px)",
              }}
            >
              {"←"} Phases
            </button>
            <IntroButton onClick={() => setIntroOpen(true)} />
          </div>
        )}

        {v !== "flowchart" && r && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 30,
              padding: `${SCRUBBER_PAD / 2}px 24px`,
              background: colors.glass,
              borderTop: `1px solid ${colors.glassBorder}`,
              backdropFilter: "blur(14px)",
            }}
          >
            <Scrubber
              index={i}
              total={r.trace.length}
              chapters={r.chapters}
              onSeek={(n) => { setPlaying(false); seek(v, n); }}
              playing={playing}
              onTogglePlay={() => setPlaying((p) => !p)}
              speed={speed}
              onSpeedChange={setSpeed}
              explain={r.trace[i]?.explain}
            />
          </div>
        )}
      </div>
    );
  }

  // Code-panel highlight: the current step's span (single-line spans get an
  // exact column range; multi-line spans highlight from their start).
  const span = activeStep?.span;
  const highlight = useMemo(
    () => span && { line: span.line, col: span.col, colEnd: span.endLine === span.line ? span.endCol : undefined },
    [span]
  );

  return (
    <div style={{ width: "100%", height: "100vh", background: colors.background, display: "flex", overflow: "hidden" }}>
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {!zoom && renderLeftPane(view)}
        {zoom && (
          <ZoomTransition
            origin={zoom.origin}
            direction={zoom.direction}
            renderFrom={() => renderLeftPane(zoom.from)}
            renderTo={() => renderLeftPane(zoom.to)}
            onDone={() => { setView(zoom.to); setZoom(null); }}
          />
        )}
      </div>

      {view === "ir" && pipeline?.ir && source ? (
        <IrConversionPanel result={pipeline.ir} index={indices.ir} source={source} />
      ) : view === "opt" && pipeline?.opt ? (
        <OptPanel result={pipeline.opt} index={indices.opt} />
      ) : view === "bytecode" && pipeline?.bytecode ? (
        <BytecodePanel result={pipeline.bytecode} index={indices.bytecode} />
      ) : view === "vm" && pipeline?.vm ? (
        <VmPanel result={pipeline.vm} index={indices.vm} />
      ) : (
      <CodePanel
        source={source}
        currentLine={highlight?.line}
        currentCol={highlight?.col}
        currentColEnd={highlight?.colEnd}
        filename={filename}
        onChange={recompile}
      />
      )}
    </div>
  );
}

// Phase 6: the dis listing of the code object being assembled, growing as
// each instruction is encoded.
function BytecodePanel({ result, index }: { result: NonNullable<PipelineResult["bytecode"]>; index: number }) {
  const step = result.trace[index];
  const row = step.current === undefined ? undefined : step.disasmSoFar[step.current];
  return (
    <DisPanel
      title={`bytecode — ${step.code} · ${step.disasmSoFar.length * 2} bytes`}
      rows={step.disasmSoFar}
      activeOffset={row?.offset}
      error={step.action === "error"}
    />
  );
}

// Phase 7: the dis listing of the running code object, PC highlighted.
function VmPanel({ result, index }: { result: NonNullable<PipelineResult["vm"]>; index: number }) {
  const step = result.trace[index];
  return <DisPanel title={`running ${step.code} · pc ${step.pc}`} rows={step.disasm} activeOffset={step.pc} error={!!step.error} />;
}
