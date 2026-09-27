// Contract for <ElkGraph> (src/components/graph/ElkGraph.tsx): every graph
// in the app — DFA, call graph, parse tree, AST, control-flow graph — is
// drawn through it, laid out by elkjs (layered, orthogonal edge routing) so
// nodes never overlap and edges never pass behind nodes.

export type NodeShape = "circle" | "doubleCircle" | "box";
export type NodeStatus = "idle" | "active" | "done" | "error" | "dim";

export interface GraphNode {
  id: string;
  label: string;          // main text (monospace)
  sublabel?: string;      // smaller second line, e.g. a type badge "int"
  lines?: string[];       // box only: multi-line body (basic blocks), rendered under label
  shape: NodeShape;
  status?: NodeStatus;    // default "idle"
  width?: number;         // defaults: circle 72, box sized to text
  height?: number;
}

export type EdgeTone = "default" | "true" | "false" | "back" | "error";
export type EdgeStatus = "idle" | "active" | "dim";

export interface GraphEdge {
  id: string;
  source: string;
  target: string;          // may equal source (self-loop)
  label?: string;          // monospace, drawn on the route
  tone?: EdgeTone;         // colour: true=green, false=red, back=dashed grey, error=red
  status?: EdgeStatus;     // active = orange + thicker; dim = faded (colour baked into stroke AND arrowhead)
}

export interface ElkGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  direction?: "RIGHT" | "DOWN"; // default "RIGHT"
  startNodeId?: string;         // draws a start arrow into this node (automata)
  // Re-layout happens only when the set of node/edge ids (or sizes/labels)
  // changes — status-only changes restyle without moving anything.
  // Fits the available box; mouse wheel zooms, drag pans, double-click resets.
  emptyText?: string;           // shown when nodes is empty
}
