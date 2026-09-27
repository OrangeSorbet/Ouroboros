import { useEffect, useMemo, useState } from "preact/hooks";
import { Navbar } from "./components/Navbar";
import { DfaGraph } from "./components/DfaGraph";
import { Scrubber, speedToIntervalMs } from "./components/Scrubber";
import { CodePanel } from "./components/CodePanel";
import { TransitionTable } from "./components/TransitionTable";
import { TokenStream } from "./components/TokenStream";
import { PhaseMinimap } from "./components/PhaseMinimap";
import type { PhaseId } from "./components/PhaseMinimap";
import { PhaseFlowchart } from "./components/PhaseFlowchart";
import { PdaStackView } from "./components/PdaStackView";
import { PdaGraph } from "./components/PdaGraph";
import { PdaTransitionTable } from "./components/PdaTransitionTable";
import { ParserTokenPanel } from "./components/ParserTokenPanel";
import { ZoomTransition } from "./components/ZoomTransition";
import { lex } from "./compiler/lexer";
import type { DfaStep } from "./compiler/lexer";
import { parse } from "./compiler/parser";
import type { PdaStep } from "./compiler/parser";
import type { Token } from "./compiler/tokens";
import { buildChapters, describeStep, describePdaStep } from "./compiler/steps";
import { colors } from "./styles/colors";
import { fonts } from "./styles/fonts";
import "./styles/layout.css";
import "./app.css";

type ViewId = "flowchart" | PhaseId;

export function App() {
  const [filename, setFilename] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [tokenCount, setTokenCount] = useState(0);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [steps, setSteps] = useState<DfaStep[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [parseTrace, setParseTrace] = useState<PdaStep[]>([]);
  const [parseIndex, setParseIndex] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.5);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewId>("flowchart");
  const [autoReturn, setAutoReturn] = useState(false);
  const [zoom, setZoom] = useState<{ from: ViewId; to: ViewId; origin: { x: number; y: number }; direction: "in" | "out" } | null>(null);

  const beginZoom = (from: ViewId, to: ViewId, origin: { x: number; y: number }) =>
    setZoom({ from, to, origin, direction: to === "flowchart" ? "out" : "in" });

  const isParseView = view === "parse";
  const activeTrace = isParseView ? parseTrace : steps;
  const activeIndex = isParseView ? parseIndex : currentIndex;
  const setActiveIndex = isParseView ? setParseIndex : setCurrentIndex;
  const chapters = useMemo(() => buildChapters(steps), [steps]);
  const currentStep = steps[currentIndex];
  const currentPdaStep = parseTrace[parseIndex];
  // A pop's tokenIndex is the *next* lookahead — a token the rule that just
  // popped never touched — so highlighting it reads as "working on
  // something not started yet." Highlight the last token that rule
  // actually consumed instead (one behind the lookahead). Push/consume
  // steps' tokenIndex already IS the token being looked at/consumed.
  const displayTokenIndex = currentPdaStep
    ? currentPdaStep.action === "pop"
      ? Math.max(currentPdaStep.tokenIndex - 1, 0)
      : currentPdaStep.tokenIndex
    : undefined;
  const currentToken = displayTokenIndex != null ? tokens[displayTokenIndex] : undefined;

  // A phase only "finishes" once the user has actually watched it play
  // through to its last step — but finishing a later phase implies every
  // earlier one already succeeded (you can't parse without a full lex),
  // so completion always backfills onto earlier phases too.
  const lexWatched = steps.length > 0 && currentIndex >= steps.length - 1;
  const parseWatched = parseTrace.length > 0 && parseIndex >= parseTrace.length - 1;
  const parseDone = parseWatched;
  const lexDone = lexWatched || parseDone;
  const completedPhases: PhaseId[] = [...(lexDone ? (["lex"] as PhaseId[]) : []), ...(parseDone ? (["parse"] as PhaseId[]) : [])];
  const enabledPhases: PhaseId[] = [...(steps.length > 0 ? (["lex"] as PhaseId[]) : []), ...(steps.length > 0 ? (["parse"] as PhaseId[]) : [])];
  const flowchartActivePhase: PhaseId = lexDone ? "parse" : "lex";

  const recompile = (text: string) => {
    setSource(text);
    setError(null);
    setParseError(null);
    setPlaying(false);
    setParseTrace([]);
    setParseIndex(0);
    try {
      const { tokens: lexedTokens, trace } = lex(text);
      setTokenCount(lexedTokens.length);
      setTokens(lexedTokens);
      setSteps(trace);
      setCurrentIndex(0);
      try {
        const { trace: pdaTrace } = parse(lexedTokens);
        setParseTrace(pdaTrace);
      } catch (pe) {
        setParseError(pe instanceof Error ? pe.message : String(pe));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSteps([]);
    }
  };

  const handleLoad = (text: string, name: string) => {
    setFilename(name);
    recompile(text);
  };

  useEffect(() => {
    if (!playing) return;
    const intervalMs = speedToIntervalMs(speed);
    if (intervalMs === null) return; // speed 0 = manual, autoplay does nothing
    if (activeIndex >= activeTrace.length - 1) {
      setPlaying(false);
      if (view !== "flowchart") setAutoReturn(true);
      return;
    }
    const id = setTimeout(() => setActiveIndex((i) => Math.min(i + 1, activeTrace.length - 1)), intervalMs);
    return () => clearTimeout(id);
  }, [playing, activeIndex, activeTrace.length, view, speed]);

  // Cinematic zoom-out: once autoplay finishes a phase's steps, pause on
  // the finished state briefly, then dolly back out to the flowchart with
  // that phase marked complete.
  useEffect(() => {
    if (!autoReturn) return;
    const id = setTimeout(() => {
      beginZoom(view, "flowchart", { x: window.innerWidth / 2, y: window.innerHeight / 2 });
      setAutoReturn(false);
    }, 900);
    return () => clearTimeout(id);
  }, [autoReturn]);

  function renderMainContent(v: ViewId) {
    if (v === "flowchart") {
      return (
        <PhaseFlowchart
          activePhase={flowchartActivePhase}
          completedPhases={completedPhases}
          enabledPhases={enabledPhases}
          onSelectPhase={(id, origin) => beginZoom(view, id, origin)}
        />
      );
    }
    if (v === "parse") {
      return parseError ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: colors.error, fontFamily: fonts.mono, fontSize: 13, maxWidth: 480, textAlign: "center" }}>
            Parse error: {parseError}
          </p>
        </div>
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex" }}>
          {/* Left: the theoretical side — the parser's call structure drawn
              as an actual PDA graph, plus its transition table. Wider, since
              a 15-state graph needs more room than a stack ever will. */}
          <PdaGraph step={currentPdaStep} />
          <PdaTransitionTable step={currentPdaStep} />

          {/* Right: the technical side — the parser's real explicit stack
              and the token list it's consuming. Scrolls as one column so
              both stay reachable instead of either one clipping. */}
          <div style={{ flex: "1 1 30%", minWidth: 0, height: "100%", display: "flex", flexDirection: "column", overflowY: "auto", borderLeft: `1px solid ${colors.border}`, background: colors.background, paddingTop: 86 }}>
            <div style={{ padding: "0 14px 10px", fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, color: colors.textSecondary }}>
              TECHNICAL — parser internals
            </div>
            <PdaStackView step={currentPdaStep} />
            <ParserTokenPanel tokens={tokens} currentIndex={displayTokenIndex} />
          </div>
        </div>
      );
    }
    return (
      <>
        <DfaGraph step={currentStep} />
        <TransitionTable step={currentStep} />
        <TokenStream steps={steps} uptoIndex={currentIndex} />
      </>
    );
  }

  // The left pane only — navbar, canvas, back button, minimap, scrubber.
  // Reused for the live render AND for both layers of the zoom transition,
  // so mid-zoom shows the real chrome, not just a bare canvas standing in
  // for it. The code panel is NEVER part of this — it's a permanent,
  // always-visible sibling in the outer split-screen layout, untouched by
  // zoom transitions no matter which view is active.
  function renderLeftPane(v: ViewId) {
    const vIsParseView = v === "parse";
    const vActiveTrace = vIsParseView ? parseTrace : steps;
    const vActiveIndex = vIsParseView ? parseIndex : currentIndex;
    const vSetActiveIndex = vIsParseView ? setParseIndex : setCurrentIndex;

    return (
        <div style={{ height: "100vh", width: "100%", position: "relative", overflow: "hidden", background: colors.background }}>
          <div style={{ position: "absolute", inset: 0 }}>{renderMainContent(v)}</div>

          <Navbar filename={filename} tokenCount={tokenCount} onLoad={handleLoad} />

          {v !== "flowchart" && (
            <button
              onClick={(e: any) => {
                const rect = e.currentTarget.getBoundingClientRect();
                beginZoom(view, "flowchart", { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
              }}
              style={{
                position: "absolute",
                top: 86,
                left: 16,
                zIndex: 30,
                background: colors.glass,
                border: `1px solid ${colors.glassBorder}`,
                borderRadius: 8,
                color: colors.textPrimary,
                fontSize: 12,
                padding: "6px 12px",
                cursor: "pointer",
                backdropFilter: "blur(14px)",
              }}
            >
              {"←"} Phases
            </button>
          )}

          {v !== "flowchart" && (
            <PhaseMinimap activePhase={v} completedPhases={completedPhases} dim={steps.length === 0} />
          )}

          {error && (
            <div style={{ position: "absolute", top: 86, left: "50%", transform: "translateX(-50%)", color: colors.error, fontSize: 13, zIndex: 30 }}>
              {error}
            </div>
          )}

          {v !== "flowchart" && (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 30,
                padding: "10px 24px 14px",
                background: colors.glass,
                borderTop: `1px solid ${colors.glassBorder}`,
                backdropFilter: "blur(14px)",
                opacity: vActiveTrace.length > 0 ? 1 : 0.55,
                pointerEvents: vActiveTrace.length > 0 ? "auto" : "none",
              }}
            >
              <Scrubber
                index={vActiveIndex}
                total={vActiveTrace.length}
                chapters={vIsParseView ? [] : chapters}
                onSeek={(i) => { setPlaying(false); vSetActiveIndex(i); }}
                playing={playing}
                onTogglePlay={() => setPlaying((p) => !p)}
                speed={speed}
                onSpeedChange={setSpeed}
                description={
                  vIsParseView
                    ? currentPdaStep
                      ? describePdaStep(currentPdaStep)
                      : "Upload a .snek file to see the PDA stack."
                    : currentStep
                      ? describeStep(currentStep)
                      : "Upload a .snek file to begin."
                }
                meta={
                  vIsParseView
                    ? currentPdaStep && `${currentPdaStep.action.toUpperCase()} ${currentPdaStep.symbol}`
                    : currentStep && `${currentStep.from} → ${currentStep.to}`
                }
              />
            </div>
          )}
        </div>
    );
  }

  const isParseViewNow = view === "parse";

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

      <CodePanel
        source={source}
        currentLine={isParseViewNow ? currentToken?.line : currentStep?.line}
        currentCol={isParseViewNow ? currentToken?.col : currentStep?.col}
        currentColEnd={isParseViewNow && currentToken ? currentToken.col + Math.max(currentToken.lexeme.length, 1) - 1 : undefined}
        filename={filename}
        onChange={recompile}
      />
    </div>
  );
}
