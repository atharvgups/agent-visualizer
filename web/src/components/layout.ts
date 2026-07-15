import dagre from "@dagrejs/dagre";
import { Plan } from "@agent-viz/shared";

export interface LaidOutNode {
  id: string;
  x: number;
  y: number;
}

const NODE_W = 210;
const NODE_H = 84;

/** Auto-layout: the user never places nodes; the graph is generated. */
export function layoutPlan(plan: Plan): Map<string, LaidOutNode> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 36, ranksep: 70 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of plan.nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of plan.edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  const out = new Map<string, LaidOutNode>();
  for (const n of plan.nodes) {
    const pos = g.node(n.id);
    out.set(n.id, { id: n.id, x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 });
  }
  return out;
}

export const NODE_SIZE = { width: NODE_W, height: NODE_H };
