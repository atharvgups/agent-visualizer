import { useEffect, useMemo, useRef } from "react";
import {
  Background,
  Controls,
  Edge,
  MarkerType,
  Node,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { RunState } from "@agent-viz/shared";
import { layoutPlan } from "./layout";
import { PlanNodeCard, PlanNodeData } from "./PlanNodeCard";

const nodeTypes = { plan: PlanNodeCard };

export function FlowMap({
  state,
  onSelect,
}: {
  state: RunState;
  onSelect: (nodeId: string) => void;
}) {
  const { fitView } = useReactFlow();
  const knownIds = useRef<Set<string>>(new Set());
  const plan = state.plan;

  const { nodes, edges } = useMemo(() => {
    if (!plan) return { nodes: [] as Node<PlanNodeData>[], edges: [] as Edge[] };
    const positions = layoutPlan(plan);
    const nodes: Node<PlanNodeData>[] = plan.nodes.map((n) => {
      const rt = state.nodeRuntime[n.id];
      const pos = positions.get(n.id)!;
      return {
        id: n.id,
        type: "plan",
        position: { x: pos.x, y: pos.y },
        data: {
          label: n.label,
          kind: n.kind,
          status: rt?.status ?? "proposed",
          branch: n.branch,
          counters: rt?.counters ?? {},
          note: rt?.note,
          isNew: !knownIds.current.has(n.id) && knownIds.current.size > 0,
          hasPreferenceNote: Boolean(rt?.preferenceNote),
        },
      };
    });
    const edges: Edge[] = plan.edges.map((e) => {
      const targetStatus = state.nodeRuntime[e.target]?.status;
      const active = targetStatus === "running" || targetStatus === "blocked";
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        animated: active,
        className: `flow-edge${active ? " edge-active" : ""}`,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      };
    });
    return { nodes, edges };
  }, [plan, state.nodeRuntime]);

  // refit when the graph gains/loses nodes (amendments, gate moves)
  useEffect(() => {
    if (!plan) return;
    const ids = new Set(plan.nodes.map((n) => n.id));
    const changed = ids.size !== knownIds.current.size || [...ids].some((id) => !knownIds.current.has(id));
    if (changed) {
      knownIds.current = ids;
      requestAnimationFrame(() => fitView({ padding: 0.15, duration: 500 }));
    }
  }, [plan, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => onSelect(node.id)}
      fitView
      proOptions={{ hideAttribution: true }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      minZoom={0.3}
    >
      <Background color="#233043" gap={24} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
