import { ReactFlow, Background, BaseEdge, EdgeLabelRenderer, Handle, MarkerType, Position, useReactFlow, ReactFlowProvider } from "@xyflow/react";
import type { EdgeProps, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef } from "preact/hooks";
import { PDA_SYMBOLS, PDA_EDGES, activePdaEdgeKey, edgeKey } from "../compiler/pda";
import type { PdaSymbol } from "../compiler/pda";
import { GRAMMAR_RULES } from "../compiler/messages";
import type { PdaStep } from "../compiler/parser";
import { colors } from "../styles/colors";
import { fonts } from "../styles/fonts";

interface PdaGraphProps {
  step?: PdaStep;
}

// Two columns: statement-level non-terminals on the left (the shape of a
// program), expression-precedence non-terminals on the right (the shape of
// one expression) — mirrors DfaGraph's two-column layout for the same
// reason: every edge either crosses the gap once or stays within a column,
// so a single gutter-routing scheme covers all of them.
const POSITIONS: Record<PdaSymbol, { x: number; y: number }> = {
  Program: { x: 80, y: 40 },
  Statement: { x: 80, y: 190 },
  LetStmt: { x: 80, y: 340 },
  AssignStmt: { x: 80, y: 490 },
  PrintStmt: { x: 80, y: 640 },
  IfStmt: { x: 80, y: 790 },
  WhileStmt: { x: 80, y: 940 },
  Block: { x: 80, y: 1090 },
  ExprStmt: { x: 80, y: 1240 },
  Equality: { x: 620, y: 340 },
  Comparison: { x: 620, y: 490 },
  Additive: { x: 620, y: 640 },
  Multiplicative: { x: 620, y: 790 },
  Unary: { x: 620, y: 940 },
  Primary: { x: 620, y: 1090 },
};

const NODE_SIZE = 110;
const HANDLE_COUNT: number = 6;
const ARC_DEGREES = 70;
const HANDLE_ANGLES = Array.from({ length: HANDLE_COUNT }, (_, k) =>
  HANDLE_COUNT === 1 ? 0 : -ARC_DEGREES / 2 + (k * ARC_DEGREES) / (HANDLE_COUNT - 1)
);

function handleStyle(angleDeg: number, side: "left" | "right"): any {
  const rad = (angleDeg * Math.PI) / 180;
  const top = 50 + 50 * Math.sin(rad);
  const cos = 50 * Math.cos(rad);
  const left = side === "right" ? 50 + cos : 50 - cos;
  return {
    top: `${top}%`, left: `${left}%`, transform: "translate(-50%, -50%)",
    width: 1, height: 1, minWidth: 0, minHeight: 0,
    background: "transparent", border: "none", opacity: 0,
  };
}

function SymbolNode({ data }: NodeProps) {
  return (
    <>
      {HANDLE_ANGLES.map((angle, k) => (
        <Handle key={`s${k}`} type="source" id={`r${k}`} position={Position.Right} style={handleStyle(angle, "right")} />
      ))}
      {HANDLE_ANGLES.map((angle, k) => (
        <Handle key={`t${k}`} type="target" id={`l${k}`} position={Position.Left} style={handleStyle(angle, "left")} />
      ))}
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {(data as any).label}
      </div>
    </>
  );
}

const NODE_TYPES = { symbol: SymbolNode };

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
    `M ${sx},${sy}`, `L ${p1x},${sy}`,
    `Q ${gutterX},${sy} ${gutterX},${p2y}`, `L ${gutterX},${p3y}`,
    `Q ${gutterX},${ty} ${p4x},${ty}`, `L ${tx},${ty}`,
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
              pointerEvents: "none", padding: "2px 4px", borderRadius: 4, whiteSpace: "nowrap",
              background: (labelBgStyle as any)?.fill, color: (labelStyle as any)?.fill,
              fontFamily: (labelStyle as any)?.fontFamily, fontSize: (labelStyle as any)?.fontSize,
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

const EDGE_TYPES = { routed: RoutedEdge };

function makeLanePicker(min: number, max: number, count: number) {
  let i = 0;
  return () => {
    const lane = count <= 1 ? min : min + ((i % count) * (max - min)) / (count - 1);
    i++;
    return lane;
  };
}

function makeHandlePicker() {
  const counters: Record<string, number> = {};
  return (nodeId: string) => {
    const idx = (counters[nodeId] ?? 0) % HANDLE_COUNT;
    counters[nodeId] = idx + 1;
    return idx;
  };
}

function buildNodes(step?: PdaStep) {
  const activeSymbol = step?.symbol;
  return PDA_SYMBOLS.map((symbol) => {
    const isActive = symbol === activeSymbol;
    const isRoot = symbol === "Program";
    const rule = GRAMMAR_RULES[symbol];
    const boxShadow = [
      `0 0 0 ${isRoot ? 4 : 0}px ${colors.background}`,
      `0 0 0 ${isRoot ? 6 : 0}px ${colors.accent}`,
      `0 0 ${isActive ? 18 : 0}px ${isActive ? colors.nodeActiveGlow : "transparent"}`,
    ].join(", ");
    return {
      id: symbol,
      type: "symbol",
      position: POSITIONS[symbol],
      width: NODE_SIZE,
      height: NODE_SIZE,
      data: {
        label: (
          <div style={{ width: "100%", height: "100%", position: "relative", textAlign: "center" as const, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 10.5 }}>{symbol}</div>
            <div
              style={{
                fontSize: 8,
                marginTop: 4,
                minHeight: 22,
                borderTop: isActive ? "1px solid rgba(255,255,255,0.3)" : "none",
                paddingTop: isActive ? 3 : 0,
                lineHeight: 1.25,
                opacity: isActive ? 1 : 0,
                transition: "opacity 0.2s ease",
                wordBreak: "break-word" as const,
              }}
            >
              {isActive && step ? `${step.action}${step.tokenLexeme ? ` on '${step.tokenLexeme}'` : ""}` : " "}
            </div>
          </div>
        ),
      },
      draggable: false,
      title: rule,
      style: {
        background: isActive ? colors.nodeActive : colors.nodeIdle,
        border: `2.5px solid ${isRoot ? colors.accent : colors.nodeIdleBorder}`,
        color: colors.textPrimary,
        fontFamily: fonts.mono,
        fontSize: 11,
        borderRadius: "50%",
        width: NODE_SIZE,
        height: NODE_SIZE,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box" as const,
        boxShadow,
        transition: "background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
      },
    };
  });
}

// CSS `opacity` on an edge's <path> does NOT dim its arrowhead marker (the
// marker is a separate <marker> element referenced by marker-end, not a
// child the opacity cascades to) — so a faded "far" edge was rendering with
// a full-brightness arrowhead, making arrows look disconnected from their
// own line. Baking the alpha into the color itself (used for both stroke
// and markerEnd.color) keeps the two visually consistent.
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function edgeEmphasis(activeKey: string | undefined, from: string, to: string): "active" | "near" | "far" {
  if (!activeKey) return "far";
  if (activeKey === edgeKey(from, to)) return "active";
  return "far";
}

function buildEdges(step?: PdaStep) {
  const pickSource = makeHandlePicker();
  const pickTarget = makeHandlePicker();
  const nextLeftLane = makeLanePicker(140, 550, 18);
  const nextRightLane = makeLanePicker(760, 900, 3);
  const activeKey = activePdaEdgeKey(step);

  return PDA_EDGES.map((e) => {
    const sourceIdx = pickSource(e.from);
    const targetIdx = pickTarget(e.to);
    const sameColumn = POSITIONS[e.from].x === POSITIONS[e.to].x;
    const gutterX = sameColumn ? nextRightLane() : nextLeftLane();
    const emphasis = edgeEmphasis(activeKey, e.from, e.to);
    const baseColor = e.recurse ? colors.edgeEpsilon : colors.edge;
    const alpha = e.recurse ? 0.55 : 0.6;
    const renderColor = emphasis === "active" ? colors.nodeActive : withAlpha(baseColor, alpha);
    return {
      id: edgeKey(e.from, e.to),
      source: e.from,
      sourceHandle: `r${sourceIdx}`,
      target: e.to,
      targetHandle: `l${targetIdx}`,
      type: "routed",
      data: { gutterX },
      label: emphasis === "active" ? (e.recurse ? "recurse" : "calls") : undefined,
      markerEnd: { type: MarkerType.ArrowClosed, color: renderColor, width: emphasis === "active" ? 16 : 11, height: emphasis === "active" ? 16 : 11 },
      style: {
        stroke: renderColor,
        strokeWidth: emphasis === "active" ? 2.6 : 1.6,
        strokeDasharray: e.recurse ? "5 4" : undefined,
        transition: "stroke 0.2s ease, stroke-width 0.2s ease",
      },
      labelStyle: { fill: colors.nodeActive, fontFamily: fonts.mono, fontSize: 11, fontWeight: 600 },
      labelBgStyle: { fill: colors.panelBackground, fillOpacity: 0.9 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
    };
  });
}

function GraphInner({ step }: PdaGraphProps) {
  const nodes = useMemo(() => buildNodes(step), [step]);
  const edges = useMemo(() => buildEdges(step), [step]);
  const { fitView } = useReactFlow();
  const didFit = useRef(false);

  useEffect(() => {
    if (!didFit.current) {
      fitView({ padding: 0.5 });
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

export function PdaGraph({ step }: PdaGraphProps) {
  return (
    <div style={{ position: "relative", flex: "1 1 70%", minWidth: 0, height: "100%", background: colors.background }}>
      <div
        style={{
          position: "absolute",
          top: 86,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 26,
          fontFamily: fonts.mono,
          fontSize: 11,
          letterSpacing: 1,
          color: colors.textSecondary,
          background: colors.glass,
          border: `1px solid ${colors.glassBorder}`,
          borderRadius: 8,
          padding: "4px 10px",
          backdropFilter: "blur(14px)",
        }}
      >
        THEORETICAL — PDA
      </div>
      <ReactFlowProvider>
        <GraphInner step={step} />
      </ReactFlowProvider>
    </div>
  );
}
