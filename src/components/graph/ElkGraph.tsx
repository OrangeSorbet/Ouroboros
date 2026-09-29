import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import ELK from "elkjs/lib/elk-api.js";
import type { ElkNode, ElkExtendedEdge } from "elkjs/lib/elk-api.js";
import elkWorkerUrl from "elkjs/lib/elk-worker.min.js?url";
import { colors } from "../../styles/colors";
import { fonts } from "../../styles/fonts";
import type { ElkGraphProps, GraphNode, GraphEdge, NodeStatus } from "./types";

// ELK runs in a Web Worker: a 400-node parse tree takes ~250–450 ms to lay
// out, which on the main thread would freeze playback every time the tree
// grows by a node. One shared worker for every graph; ELK queues requests.
const elk = new ELK({ workerUrl: elkWorkerUrl });

const START_ID = "__start";
const LABEL_FONT = 11;
const SUB_FONT = 9.5;
const LINE_FONT = 10.5;
const EDGE_FONT = 10;
// JetBrains Mono / Fira Code advance width is 0.6em — measuring text through
// the DOM would force a synchronous reflow per node on every structure change.
const textWidth = (s: string, fontSize: number) => s.length * fontSize * 0.6;
const MAX_FIT_SCALE = 1.4; // don't blow a 2-node graph up to fill the pane

interface Box { x: number; y: number; w: number; h: number }
interface Pt { x: number; y: number }
interface Layout {
  nodes: Map<string, Box>;
  edges: Map<string, { points: Pt[]; label?: Box }>;
  width: number;
  height: number;
}

function nodeSize(n: GraphNode): { w: number; h: number } {
  if (n.shape !== "box") {
    const d = n.width ?? Math.max(72, textWidth(n.label, LABEL_FONT) + 24, n.sublabel ? textWidth(n.sublabel, SUB_FONT) + 30 : 0);
    return { w: d, h: n.height ?? d };
  }
  const lines = n.lines ?? [];
  const w = Math.max(
    textWidth(n.label, LABEL_FONT),
    n.sublabel ? textWidth(n.sublabel, SUB_FONT) : 0,
    ...lines.map((l) => textWidth(l, LINE_FONT)),
  ) + 20;
  const h = 24 + (n.sublabel ? 13 : 0) + (lines.length ? lines.length * 14 + 8 : 0);
  return { w: n.width ?? Math.max(w, 40), h: n.height ?? h };
}

function edgeLabelSize(label: string) {
  return { width: textWidth(label, EDGE_FONT) + 8, height: 15 };
}

// Mixes a #rrggbb colour toward the background. Dimming must be baked into
// the colour itself: CSS opacity on a <path> does not dim its marker.
function fade(hex: string, amount: number): string {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = parse(hex);
  const b = parse(colors.background);
  return `rgb(${a.map((v, i) => Math.round(v * amount + b[i] * (1 - amount))).join(",")})`;
}

function edgeStroke(e: GraphEdge): { color: string; width: number; dash?: string } {
  const base =
    e.tone === "true" ? colors.edgeTrue
    : e.tone === "false" ? colors.edgeFalse
    : e.tone === "back" ? colors.edgeBack
    : e.tone === "error" ? colors.error
    : colors.edge;
  const dash = e.tone === "back" ? "5 4" : undefined;
  if (e.status === "active") return { color: colors.nodeActive, width: 2.5, dash };
  if (e.status === "dim") return { color: fade(base, 0.3), width: 1.25, dash };
  return { color: base, width: 1.5, dash };
}

const NODE_STYLE: Record<NodeStatus, { fill: string; stroke: string; opacity: number; glow: string }> = {
  idle: { fill: colors.nodeIdle, stroke: colors.nodeIdleBorder, opacity: 1, glow: "none" },
  active: { fill: colors.nodeActive, stroke: colors.nodeActive, opacity: 1, glow: `drop-shadow(0 0 8px ${colors.nodeActiveGlow})` },
  done: { fill: colors.nodeIdle, stroke: colors.accent, opacity: 1, glow: "none" },
  error: { fill: fade(colors.error, 0.18), stroke: colors.error, opacity: 1, glow: `drop-shadow(0 0 6px ${colors.error})` },
  dim: { fill: colors.nodeIdle, stroke: colors.nodeIdleBorder, opacity: 0.3, glow: "none" },
};

// ELK attaches edges to the node's bounding box; for circles that leaves a
// gap (worst at the corners). Slide the endpoint along its final orthogonal
// segment onto the circumference instead.
function clipToCircle(end: Pt, toward: Pt, box: Box): Pt {
  const r = box.w / 2;
  const cx = box.x + r;
  const cy = box.y + box.h / 2;
  if (Math.abs(end.x - toward.x) < 0.5) {
    const dx = end.x - cx;
    if (Math.abs(dx) >= r) return end;
    const off = Math.sqrt(r * r - dx * dx);
    return { x: end.x, y: toward.y < cy ? cy - off : cy + off };
  }
  const dy = end.y - cy;
  if (Math.abs(dy) >= r) return end;
  const off = Math.sqrt(r * r - dy * dy);
  return { x: toward.x < cx ? cx - off : cx + off, y: end.y };
}

// Orthogonal polyline → path with rounded corners.
function roundedPath(pts: Pt[]): string {
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], a = pts[i - 1], b = pts[i + 1];
    const r = Math.min(6, Math.hypot(p.x - a.x, p.y - a.y) / 2, Math.hypot(b.x - p.x, b.y - p.y) / 2);
    const inLen = Math.hypot(p.x - a.x, p.y - a.y) || 1;
    const outLen = Math.hypot(b.x - p.x, b.y - p.y) || 1;
    const s = { x: p.x - ((p.x - a.x) / inLen) * r, y: p.y - ((p.y - a.y) / inLen) * r };
    const e = { x: p.x + ((b.x - p.x) / outLen) * r, y: p.y + ((b.y - p.y) / outLen) * r };
    d += ` L${s.x},${s.y} Q${p.x},${p.y} ${e.x},${e.y}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${last.x},${last.y}`;
}

async function runLayout(nodes: GraphNode[], edges: GraphEdge[], direction: string, startNodeId?: string): Promise<Layout> {
  const children: ElkNode[] = nodes.map((n) => {
    const { w, h } = nodeSize(n);
    return { id: n.id, width: w, height: h };
  });
  const elkEdges: ElkExtendedEdge[] = edges.map((e) => ({
    id: e.id,
    sources: [e.source],
    targets: [e.target],
    labels: e.label ? [{ text: e.label, ...edgeLabelSize(e.label) }] : undefined,
  }));
  // The start arrow is laid out as a real (invisible) node + edge so ELK
  // reserves room for it and routes it like everything else.
  if (startNodeId) {
    children.unshift({ id: START_ID, width: 1, height: 1 });
    elkEdges.unshift({ id: START_ID, sources: [START_ID], targets: [startNodeId] });
  }
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.json.edgeCoords": "ROOT",
      "elk.padding": "[top=16,left=16,bottom=16,right=16]",
      "elk.spacing.nodeNode": "28",
      "elk.layered.spacing.nodeNodeBetweenLayers": "48",
      "elk.spacing.edgeNode": "14",
      "elk.spacing.edgeEdge": "10",
      "elk.spacing.edgeLabel": "3",
      "elk.layered.spacing.edgeNodeBetweenLayers": "14",
      // Keep the caller's node order where crossings allow — a parse tree's
      // children must stay left-to-right in production order.
      "elk.layered.considerModelOrder.strategy": "PREFER_NODES",
      "elk.layered.cycleBreaking.strategy": "DEPTH_FIRST",
    },
    children,
    edges: elkEdges,
  };
  const res = await elk.layout(graph);

  const nodeBoxes = new Map<string, Box>();
  for (const c of res.children ?? []) nodeBoxes.set(c.id, { x: c.x ?? 0, y: c.y ?? 0, w: c.width ?? 0, h: c.height ?? 0 });
  const shapes = new Map(nodes.map((n) => [n.id, n.shape]));
  const edgeRoutes = new Map<string, { points: Pt[]; label?: Box }>();
  for (const e of (res.edges ?? []) as ElkExtendedEdge[]) {
    const sec = e.sections?.[0];
    if (!sec) continue;
    const pts = [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint].map((p) => ({ x: p.x, y: p.y }));
    const src = e.sources[0], tgt = e.targets[0];
    if (shapes.get(src) && shapes.get(src) !== "box") pts[0] = clipToCircle(pts[0], pts[1], nodeBoxes.get(src)!);
    if (shapes.get(tgt) && shapes.get(tgt) !== "box") pts[pts.length - 1] = clipToCircle(pts[pts.length - 1], pts[pts.length - 2], nodeBoxes.get(tgt)!);
    const l = e.labels?.[0];
    edgeRoutes.set(e.id, {
      points: pts,
      label: l ? { x: l.x ?? 0, y: l.y ?? 0, w: l.width ?? 0, h: l.height ?? 0 } : undefined,
    });
  }
  return { nodes: nodeBoxes, edges: edgeRoutes, width: res.width ?? 0, height: res.height ?? 0 };
}

interface ViewBox { x: number; y: number; w: number; h: number }

export function ElkGraph({ nodes, edges, direction = "RIGHT", startNodeId, emptyText }: ElkGraphProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [userView, setUserView] = useState<ViewBox | null>(null);
  const drag = useRef<{ x: number; y: number; view: ViewBox } | null>(null);
  // Touch: live pointers, and the pinch in progress (start distance, start
  // view, and the fingers' midpoint in SVG units — the point that stays put).
  const pointers = useRef(new Map<number, Pt>());
  const pinch = useRef<{ dist: number; view: ViewBox; mid: Pt } | null>(null);

  // Edges whose endpoints aren't in `nodes` would make ELK reject the whole
  // graph — drop them rather than blanking the view.
  const validEdges = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    return edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  }, [nodes, edges]);

  // Everything that affects geometry, and nothing that doesn't (status,
  // tone) — so stepping through a trace restyles without re-laying out.
  const structureKey = useMemo(
    () => JSON.stringify([
      direction,
      startNodeId && nodes.some((n) => n.id === startNodeId) ? startNodeId : null,
      nodes.map((n) => [n.id, n.shape, n.label, n.sublabel, n.lines, n.width, n.height]),
      validEdges.map((e) => [e.id, e.source, e.target, e.label]),
    ]),
    [direction, startNodeId, nodes, validEdges],
  );

  const latest = useRef({ nodes, validEdges });
  latest.current = { nodes, validEdges };
  const requestSeq = useRef(0);

  useEffect(() => {
    const { nodes: ns, validEdges: es } = latest.current;
    if (ns.length === 0) { setLayout(null); return; }
    const seq = ++requestSeq.current;
    const start = startNodeId && ns.some((n) => n.id === startNodeId) ? startNodeId : undefined;
    // The previous layout stays on screen until this resolves; a result
    // that arrives after a newer request was issued is discarded.
    runLayout(ns, es, direction, start)
      .then((l) => { if (seq === requestSeq.current) setLayout(l); })
      .catch((err) => console.error("ELK layout failed", err));
  }, [structureKey]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitView: ViewBox | null = useMemo(() => {
    if (!layout || size.w === 0 || size.h === 0) return null;
    const w = Math.max(layout.width, size.w / MAX_FIT_SCALE);
    const h = Math.max(layout.height, size.h / MAX_FIT_SCALE);
    return { x: (layout.width - w) / 2, y: (layout.height - h) / 2, w, h };
  }, [layout, size.w, size.h]);
  const view = userView ?? fitView;

  // Client px → SVG user units, through the live screen CTM (accounts for
  // preserveAspectRatio letterboxing without redoing that math here).
  const toSvg = (clientX: number, clientY: number): Pt | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const onWheel = (e: WheelEvent) => {
    if (!view) return;
    e.preventDefault();
    const p = toSvg(e.clientX, e.clientY);
    if (!p) return;
    const f = Math.exp(e.deltaY * 0.0015);
    setUserView({ x: p.x - (p.x - view.x) * f, y: p.y - (p.y - view.y) * f, w: view.w * f, h: view.h * f });
  };

  const pinchState = () => {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!view || e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const { dist, mid } = pinchState();
      const m = toSvg(mid.x, mid.y);
      drag.current = null;
      pinch.current = m && dist > 0 ? { dist, view, mid: m } : null;
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, view };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    if (p && pointers.current.size === 2) {
      const f = p.dist / Math.max(1, pinchState().dist);
      setUserView({ x: p.mid.x - (p.mid.x - p.view.x) * f, y: p.mid.y - (p.mid.y - p.view.y) * f, w: p.view.w * f, h: p.view.h * f });
      return;
    }
    const d = drag.current;
    const ctm = svgRef.current?.getScreenCTM();
    if (!d || !ctm) return;
    setUserView({ ...d.view, x: d.view.x - (e.clientX - d.x) / ctm.a, y: d.view.y - (e.clientY - d.y) / ctm.d });
  };
  const endDrag = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
    drag.current = null;
  };

  const markerColors = new Set<string>([colors.textPrimary]);
  const edgeViews = validEdges
    .map((e) => ({ e, route: layout?.edges.get(e.id), stroke: edgeStroke(e) }))
    .filter((v) => v.route);
  for (const v of edgeViews) markerColors.add(v.stroke.color);
  // Active edges last so they're painted over any edge they cross.
  edgeViews.sort((a, b) => Number(a.e.status === "active") - Number(b.e.status === "active"));
  const markerId = (c: string) => `arr-${uid}-${c.replace(/[^a-zA-Z0-9]/g, "")}`;
  const startRoute = layout?.edges.get(START_ID);

  return (
    <div ref={boxRef} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {nodes.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: colors.textSecondary, fontFamily: fonts.base, fontSize: 13 }}>
          {emptyText ?? ""}
        </div>
      )}
      {nodes.length > 0 && view && layout && (
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: "block", cursor: "grab", userSelect: "none", touchAction: "none" }}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDblClick={() => setUserView(null)}
        >
          <defs>
            {[...markerColors].map((c) => (
              <marker key={c} id={markerId(c)} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={c} />
              </marker>
            ))}
          </defs>

          {startRoute && (
            <path d={roundedPath(startRoute.points)} fill="none" stroke={colors.textPrimary} stroke-width={2} marker-end={`url(#${markerId(colors.textPrimary)})`} />
          )}

          {edgeViews.map(({ e, route, stroke }) => (
            <path
              key={e.id}
              d={roundedPath(route!.points)}
              fill="none"
              stroke={stroke.color}
              stroke-width={stroke.width}
              stroke-dasharray={stroke.dash}
              marker-end={`url(#${markerId(stroke.color)})`}
              style={{ transition: "stroke 0.25s ease, stroke-width 0.25s ease" }}
            />
          ))}

          {edgeViews.map(({ e, route }) => {
            const l = route!.label;
            if (!e.label || !l) return null;
            const textColor = e.status === "active" ? colors.nodeActive : e.status === "dim" ? fade(colors.edgeLabel, 0.35) : colors.edgeLabel;
            return (
              <g key={`l-${e.id}`}>
                <rect x={l.x} y={l.y} width={l.w} height={l.h} rx={3} fill={colors.background} fill-opacity={0.85} />
                <text
                  x={l.x + l.w / 2}
                  y={l.y + l.h / 2}
                  text-anchor="middle"
                  dominant-baseline="central"
                  fill={textColor}
                  style={{ fontFamily: fonts.mono, fontSize: EDGE_FONT, fontWeight: e.status === "active" ? 700 : 400, transition: "fill 0.25s ease" }}
                >
                  {e.label}
                </text>
              </g>
            );
          })}

          {nodes.map((n) => {
            const b = layout.nodes.get(n.id);
            if (!b) return null;
            return <NodeShapeView key={n.id} node={n} box={b} />;
          })}
        </svg>
      )}
    </div>
  );
}

function NodeShapeView({ node, box }: { node: GraphNode; box: Box }) {
  const s = NODE_STYLE[node.status ?? "idle"];
  const trans = "fill 0.25s ease, stroke 0.25s ease, opacity 0.25s ease, filter 0.25s ease";
  const cx = box.x + box.w / 2;
  const textFill = colors.textPrimary;
  const labelStyle = { fontFamily: fonts.mono, fontSize: LABEL_FONT, fontWeight: 700 };
  const subStyle = { fontFamily: fonts.mono, fontSize: SUB_FONT };

  if (node.shape !== "box") {
    const r = box.w / 2;
    const cy = box.y + box.h / 2;
    return (
      <g style={{ opacity: s.opacity, filter: s.glow, transition: trans }}>
        <circle cx={cx} cy={cy} r={r - 1.25} fill={s.fill} stroke={s.stroke} stroke-width={2.5} style={{ transition: trans }} />
        {node.shape === "doubleCircle" && (
          <circle cx={cx} cy={cy} r={r - 6} fill="none" stroke={s.stroke} stroke-width={1.5} style={{ transition: trans }} />
        )}
        <text x={cx} y={node.sublabel ? cy - 5 : cy} text-anchor="middle" dominant-baseline="central" fill={textFill} style={labelStyle}>
          {node.label}
        </text>
        {node.sublabel && (
          <text x={cx} y={cy + 9} text-anchor="middle" dominant-baseline="central" fill={colors.typeBadge} style={subStyle}>
            {node.sublabel}
          </text>
        )}
      </g>
    );
  }

  const lines = node.lines ?? [];
  const headH = 24 + (node.sublabel ? 13 : 0);
  return (
    <g style={{ opacity: s.opacity, filter: s.glow, transition: trans }}>
      <rect x={box.x + 1} y={box.y + 1} width={box.w - 2} height={box.h - 2} rx={6} fill={s.fill} stroke={s.stroke} stroke-width={2} style={{ transition: trans }} />
      <text x={cx} y={box.y + 12} text-anchor="middle" dominant-baseline="central" fill={textFill} style={labelStyle}>
        {node.label}
      </text>
      {node.sublabel && (
        <text x={cx} y={box.y + 25} text-anchor="middle" dominant-baseline="central" fill={colors.typeBadge} style={subStyle}>
          {node.sublabel}
        </text>
      )}
      {lines.length > 0 && (
        <>
          <line x1={box.x + 1} x2={box.x + box.w - 1} y1={box.y + headH} y2={box.y + headH} stroke={s.stroke} stroke-opacity={0.5} />
          {lines.map((l, i) => (
            <text
              key={i}
              x={box.x + 10}
              y={box.y + headH + 11 + i * 14}
              dominant-baseline="central"
              fill={node.status === "active" ? textFill : colors.codeForeground}
              style={{ fontFamily: fonts.mono, fontSize: LINE_FONT, whiteSpace: "pre" }}
            >
              {l}
            </text>
          ))}
        </>
      )}
    </g>
  );
}
