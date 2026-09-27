import { ReactFlow, Background, BaseEdge, EdgeLabelRenderer, Handle, MarkerType, Position, useReactFlow, ReactFlowProvider } from "@xyflow/react";
import type { EdgeProps, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef } from "preact/hooks";
import { State, TRANSITIONS, ACCEPTING, CLASS_LABELS } from "../compiler/dfa";
import type { CharClass } from "../compiler/dfa";
import type { DfaStep } from "../compiler/lexer";
import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";

interface DfaGraphProps {
  step?: DfaStep;
}

// Two columns only: START on the left, every other state in a single
// right-hand column. None of these states feed into a third column —
// they either self-loop, accept-and-restart (epsilon, back to START),
// or reject (into DEAD) — so a strict left-to-right flow needs just two
// columns, with back-edges arcing around to re-enter START's left side.
const POSITIONS: Record<State, { x: number; y: number }> = {
  [State.START]: { x: 80, y: 480 },
  [State.IN_IDENT]: { x: 680, y: 40 },
  [State.IN_NUMBER]: { x: 680, y: 190 },
  [State.SAW_EQ]: { x: 680, y: 340 },
  [State.SAW_LT]: { x: 680, y: 490 },
  [State.SAW_GT]: { x: 680, y: 640 },
  [State.SAW_BANG]: { x: 680, y: 790 },
  [State.IN_COMMENT]: { x: 680, y: 940 },
  [State.DEAD]: { x: 680, y: 1090 },
};

const EDGE_COLORS: Partial<Record<CharClass, string>> = {
  letter: "#60a5fa",
  digit: "#34d399",
  eq: "#c084fc",
  lt: "#f472b6",
  gt: "#f472b6",
  bang: "#fb7185",
  hash: "#94a3b8",
  epsilon: colors.edgeEpsilon,
  reject: colors.error,
};

// Every node gets this many source handles evenly spread across its right
// semicircle and this many target handles across its left semicircle —
// so multiple edges leave/enter at distinct points on the circumference
// instead of bunching through one spot. 8 comfortably covers START's
// worst-case fan-out (7 outgoing classes).
const HANDLE_COUNT: number = 8;
const ARC_DEGREES = 76;
const HANDLE_ANGLES = Array.from({ length: HANDLE_COUNT }, (_, k) =>
  HANDLE_COUNT === 1 ? 0 : -ARC_DEGREES / 2 + (k * ARC_DEGREES) / (HANDLE_COUNT - 1)
);

function handleStyle(angleDeg: number, side: "left" | "right"): any {
  const rad = (angleDeg * Math.PI) / 180;
  const top = 50 + 50 * Math.sin(rad);
  const cos = 50 * Math.cos(rad);
  const left = side === "right" ? 50 + cos : 50 - cos;
  return {
    top: `${top}%`,
    left: `${left}%`,
    transform: "translate(-50%, -50%)",
    width: 1,
    height: 1,
    minWidth: 0,
    minHeight: 0,
    background: "transparent",
    border: "none",
    opacity: 0,
  };
}

// Custom node type: a circle (styled entirely via node.style, set in
// buildNodes) with HANDLE_COUNT source handles fanned across its right
// arc and HANDLE_COUNT target handles fanned across its left arc — the
// visible circle never has edges anchored to a single point.
function StateNode({ data }: NodeProps) {
  return (
    <>
      {HANDLE_ANGLES.map((angle, k) => (
        <Handle key={`s${k}`} type="source" id={`r${k}`} position={Position.Right} style={handleStyle(angle, "right")} />
      ))}
      {HANDLE_ANGLES.map((angle, k) => (
        <Handle key={`t${k}`} type="target" id={`l${k}`} position={Position.Left} style={handleStyle(angle, "left")} />
      ))}
      {/* Dedicated due-left, vertically-centered handle reserved for the
          start marker's arrow, so it's a true horizontal line rather than
          landing on one of the fanned-out angled handles above. */}
      <Handle type="target" id="l-center" position={Position.Left} style={handleStyle(0, "left")} />
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {(data as any).label}
      </div>
    </>
  );
}

const NODE_TYPES = { state: StateNode };

// Hand-routed orthogonal path: horizontal out of the source, one vertical
// run down a shared "gutter" x that is guaranteed clear of every node's
// bounding box (nodes only ever occupy the START column or the state
// column — never the gap between them, and never right of the state
// column), then horizontal into the target. Unlike a bezier's curvature
// guess, this provably never passes behind an unrelated node, regardless
// of how many nodes sit between source and target vertically.
function routedPath(sx: number, sy: number, tx: number, ty: number, gutterX: number, radius = 14) {
  if (Math.abs(sy - ty) < 1) return `M ${sx},${sy} L ${tx},${ty}`;
  const dx1 = gutterX >= sx ? 1 : -1;
  const dy = ty >= sy ? 1 : -1;
  const dx2 = tx >= gutterX ? 1 : -1;
  const r = Math.max(0, Math.min(radius, Math.abs(gutterX - sx) - 2, Math.abs(ty - sy) / 2 - 2, Math.abs(tx - gutterX) - 2));
  const p1x = gutterX - dx1 * r;
  const p2y = sy + dy * r;
  const p3y = ty - dy * r;
  const p4x = gutterX + dx2 * r;
  return [
    `M ${sx},${sy}`,
    `L ${p1x},${sy}`,
    `Q ${gutterX},${sy} ${gutterX},${p2y}`,
    `L ${gutterX},${p3y}`,
    `Q ${gutterX},${ty} ${p4x},${ty}`,
    `L ${tx},${ty}`,
  ].join(" ");
}

function RoutedEdge({ sourceX, sourceY, targetX, targetY, data, markerEnd, style, label, labelStyle, labelBgStyle }: EdgeProps) {
  const gutterX = (data as any)?.gutterX ?? (sourceX + targetX) / 2;
  const path = routedPath(sourceX, sourceY, targetX, targetY, gutterX);
  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} />
      {label != null && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${(gutterX + targetX) / 2}px, ${targetY}px)`,
              pointerEvents: "none",
              padding: "2px 4px",
              borderRadius: 4,
              whiteSpace: "nowrap",
              background: (labelBgStyle as any)?.fill,
              color: (labelStyle as any)?.fill,
              fontFamily: (labelStyle as any)?.fontFamily,
              fontSize: (labelStyle as any)?.fontSize,
              fontWeight: (labelStyle as any)?.fontWeight,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// The start marker's edge is a single short hop with only one edge ever
// using it — no fan-out to route around, so it's just a straight line
// (not the gutter router) with a one-shot glow pulse whenever the DFA
// actually re-enters START after accepting a token (i.e. "restarting").
function StartArrowEdge({ sourceX, sourceY, targetX, targetY, markerEnd, style, data }: EdgeProps) {
  const path = `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
  const glowKey = (data as any)?.glowKey as string | undefined;
  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} />
      {glowKey && (
        <EdgeLabelRenderer>
          <div
            key={glowKey}
            className="start-restart-glow"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${targetX}px, ${targetY}px)`,
              width: 70,
              height: 70,
              borderRadius: "50%",
              pointerEvents: "none",
            }}
          />
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const EDGE_TYPES = { routed: RoutedEdge, startArrow: StartArrowEdge };

// Safe x-bands for the routing gutter: between the two columns (for any
// edge crossing from START to the state column or back), and to the
// right of the state column (for edges that stay within that column,
// like SAW_BANG's reject into DEAD). Lanes are spread across each band
// so parallel edges run side by side instead of overlapping.
function makeLanePicker(min: number, max: number, count: number) {
  let i = 0;
  return () => {
    const lane = count <= 1 ? min : min + ((i % count) * (max - min)) / (count - 1);
    i++;
    return lane;
  };
}

// Only "real" character-consuming classes count as a self-loop badge —
// epsilon/reject are restart/trap edges, not part of the reading alphabet.
function loopClassesFor(state: State): string[] {
  const table = TRANSITIONS[state];
  if (!table) return [];
  return Object.entries(table)
    .filter(([cls, next]) => next === state && cls !== "epsilon" && cls !== "reject")
    .map(([cls]) => CLASS_LABELS[cls as CharClass]);
}

function buildNodes(step?: DfaStep) {
  const activeState = step?.to;
  const stateNodes: any[] = [
    {
      id: "__start_marker",
      // Reusing the "state" custom type (not React Flow's default node)
      // hides the default node type's own visible handle dots — those
      // were the stray circles showing up next to the arrow. Positioned
      // at START's exact vertical center so the arrow into l-center is a
      // true horizontal line, not a diagonal.
      type: "state",
      position: { x: POSITIONS[State.START].x - 60, y: POSITIONS[State.START].y + 65 },
      width: 1,
      height: 1,
      data: { label: "" },
      draggable: false,
      selectable: false,
      style: { width: 1, height: 1, background: "transparent", border: "none" },
    },
  ];
  stateNodes.push(...(Object.values(State) as State[]).map((state) => {
    const isActive = state === activeState;
    const isAccepting = state in ACCEPTING;
    const isDead = state === State.DEAD;
    const loops = loopClassesFor(state);
    const detailVisible = isActive && !!step;
    const detailText = step?.char ? `on '${step.char}'` : "epsilon: accept";

    // Fixed 3-layer box-shadow at all times (only color/blur/opacity vary)
    // so state changes cross-fade instead of snapping — a shadow with a
    // different *number* of layers can't be interpolated by the browser.
    const ringColor = isDead ? colors.error : colors.accent;
    const boxShadow = [
      `0 0 0 ${isAccepting || isDead ? 4 : 0}px ${colors.background}`,
      `0 0 0 ${isAccepting || isDead ? 6 : 0}px ${ringColor}`,
      `0 0 ${isActive ? 18 : 0}px ${isActive ? colors.nodeActiveGlow : "transparent"}`,
    ].join(", ");

    return {
      id: state,
      type: "state",
      position: POSITIONS[state],
      // Explicit width/height on the node itself (not just in `style`) —
      // without these, React Flow has to measure custom node types via
      // ResizeObserver on every prop replacement, which briefly renders
      // them at their default size first. That one-frame default-size
      // pass is the "whole graph flashes" bug: with size known upfront,
      // there's nothing to measure and nothing to snap.
      width: 130,
      height: 130,
      data: {
        label: (
          <div style={{ width: "100%", height: "100%", position: "relative", textAlign: "center" as const, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            {isActive && step?.emitted && (
              <div key={`${step.line}-${step.col}-${step.emitted.lexeme}`} className="accept-pulse-ring" style={{ borderColor: colors.accent }} />
            )}
            <div style={{ fontWeight: 700 }}>{state}{isDead ? " ⨯" : ""}</div>
            <div style={{ fontSize: 8, opacity: loops.length > 0 ? 0.65 : 0, marginTop: 2, transition: "opacity 0.2s ease" }}>
              {loops.length > 0 ? `reads: ${loops.join(", ")}` : " "}
            </div>
            <div
              style={{
                fontSize: 9,
                marginTop: 4,
                minHeight: 26,
                borderTop: "1px solid rgba(255,255,255,0.3)",
                paddingTop: 3,
                lineHeight: 1.3,
                opacity: detailVisible ? 1 : 0,
                transition: "opacity 0.2s ease",
              }}
            >
              <div>{detailVisible ? detailText : " "}</div>
              <div>{detailVisible && step?.lexemeSoFar ? `buf: "${step.lexemeSoFar}"` : " "}</div>
            </div>
          </div>
        ),
      },
      draggable: false,
      style: {
        background: isActive ? colors.nodeActive : isDead ? "#2a1414" : colors.nodeIdle,
        border: `2.5px solid ${isDead ? colors.error : isAccepting ? colors.accent : colors.nodeIdleBorder}`,
        color: colors.textPrimary,
        fontFamily: fonts.mono,
        fontSize: 11,
        borderRadius: "50%",
        width: 130,
        height: 130,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 6,
        boxSizing: "border-box",
        boxShadow,
        transition: "background 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease",
      },
    };
  }));
  return stateNodes;
}

// Round-robins handle slots per node so successive edges touching the
// same node land on different points around its circumference instead
// of all stacking on handle 0.
function makeHandlePicker() {
  const counters: Record<string, number> = {};
  return (nodeId: string) => {
    const idx = (counters[nodeId] ?? 0) % HANDLE_COUNT;
    counters[nodeId] = idx + 1;
    return idx;
  };
}

// Spotlight model: with ~20 edges drawn at once, showing all of them at
// full strength is unreadable. Only the exact edge the DFA is traversing
// right now gets full opacity + its label; edges touching the active
// node fade to a medium "structurally nearby" level; everything else
// recedes to a faint ghost of the full transition table.
function edgeEmphasis(step: DfaStep | undefined, source: string, target: string): "active" | "near" | "far" {
  if (!step) return "far";
  if (step.from === source && step.to === target) return "active";
  if (step.to === source || step.to === target) return "near";
  return "far";
}

function buildEdges(step?: DfaStep) {
  const pickSource = makeHandlePicker();
  const pickTarget = makeHandlePicker();
  const nextLeftLane = makeLanePicker(170, 590, 16);
  const nextRightLane = makeLanePicker(770, 900, 4);

  const startEmphasis = edgeEmphasis(step, "__start_marker", State.START);
  // The DFA "restarts" exactly when a step lands back on START having
  // just emitted a token — glow the start arrow at that instant so it
  // reads as "control is returning here to scan the next token."
  const justRestarted = !!step && step.to === State.START && !!step.emitted;
  const startEdge = {
    id: "__start_edge",
    source: "__start_marker",
    sourceHandle: "r0",
    target: State.START,
    targetHandle: "l-center",
    label: !step ? "start" : undefined,
    type: "startArrow",
    data: { glowKey: justRestarted ? `${step!.line}-${step!.col}-${step!.emitted!.lexeme}` : undefined },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#ffffff", width: 16, height: 16 },
    style: { stroke: "#ffffff", strokeWidth: justRestarted ? 3 : 2, opacity: startEmphasis === "far" && step ? 0.15 : 1 },
    labelStyle: { fill: "#ffffff", fontFamily: fonts.mono, fontSize: 10 },
  };

  const edges: any[] = [startEdge];
  for (const [state, table] of Object.entries(TRANSITIONS)) {
    if (!table) continue;
    for (const [charClass, nextState] of Object.entries(table)) {
      if (!nextState || nextState === state) continue;
      const cls = charClass as CharClass;
      const isPseudo = cls === "epsilon" || cls === "reject";
      const stroke = EDGE_COLORS[cls] ?? colors.edge;
      const sourceIdx = pickSource(state);
      const targetIdx = pickTarget(nextState as string);
      // Same column (e.g. SAW_BANG -> DEAD) routes through a lane right
      // of the whole column; crossing columns (START <-> a state) routes
      // through a lane in the gap between them. Either way the lane sits
      // in an x-band no node ever occupies.
      const sameColumn = POSITIONS[state as State].x === POSITIONS[nextState as State].x;
      const gutterX = sameColumn ? nextRightLane() : nextLeftLane();
      const emphasis = edgeEmphasis(step, state, nextState as string);
      const opacity = emphasis === "active" ? 1 : emphasis === "near" ? 0.4 : 0.12;
      const strokeWidth = emphasis === "active" ? (isPseudo ? 2 : 2.4) : isPseudo ? 1.2 : 1.4;
      edges.push({
        id: `${state}-${charClass}-${nextState}`,
        source: state,
        sourceHandle: `r${sourceIdx}`,
        target: nextState as string,
        targetHandle: `l${targetIdx}`,
        type: "routed",
        data: { gutterX },
        label: emphasis === "active" ? CLASS_LABELS[cls] : undefined,
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: emphasis === "active" ? 16 : 10, height: emphasis === "active" ? 16 : 10 },
        style: { stroke, strokeWidth, strokeDasharray: isPseudo ? "5 4" : undefined, opacity, transition: "opacity 0.2s ease, stroke-width 0.2s ease" },
        labelStyle: { fill: stroke, fontFamily: fonts.mono, fontSize: 11, fontWeight: 600 },
        labelBgStyle: { fill: colors.panelBackground, fillOpacity: 0.9 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
      });
    }
  }
  return edges;
}

function GraphInner({ step }: DfaGraphProps) {
  const nodes = useMemo(() => buildNodes(step), [step]);
  const edges = useMemo(() => buildEdges(step), [step]);
  const { fitView } = useReactFlow();
  const didFit = useRef(false);

  useEffect(() => {
    if (!didFit.current) {
      fitView({ padding: 0.55 });
      didFit.current = true;
    }
  }, []);

  return (
    <ReactFlow
      nodes={nodes as any}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
    >
      <Background color={colors.border} gap={20} />
    </ReactFlow>
  );
}

export function DfaGraph({ step }: DfaGraphProps) {
  return (
    <div style={{ position: "absolute", top: 0, bottom: 0, left: 256, right: 236, background: colors.background }}>
      <ReactFlowProvider>
        <GraphInner step={step} />
      </ReactFlowProvider>
    </div>
  );
}
