import { Plan, PlanMutation } from "./plan";

/**
 * Rewires the plan so `gateId` sits immediately after `afterNodeId`.
 * Used for the one pre-approval graph edit allowed in v1 (dragging the
 * human-review gate earlier or later in the pipeline).
 */
export function moveGateMutation(plan: Plan, gateId: string, afterNodeId: string): PlanMutation {
  const removeEdgeIds: string[] = [];
  const addEdges: PlanMutation["addEdges"] = [];

  const incoming = plan.edges.filter((e) => e.target === gateId);
  const outgoing = plan.edges.filter((e) => e.source === gateId);

  // Bridge the gap the gate leaves behind.
  for (const inEdge of incoming) {
    removeEdgeIds.push(inEdge.id);
    for (const outEdge of outgoing) {
      if (inEdge.source !== outEdge.target) {
        addEdges.push({
          id: `bridge-${inEdge.source}-${outEdge.target}`,
          source: inEdge.source,
          target: outEdge.target,
        });
      }
    }
  }
  for (const outEdge of outgoing) removeEdgeIds.push(outEdge.id);

  // Splice the gate in after the anchor node.
  const anchorOut = plan.edges.filter(
    (e) => e.source === afterNodeId && e.target !== gateId && !removeEdgeIds.includes(e.id)
  );
  for (const e of anchorOut) {
    removeEdgeIds.push(e.id);
    addEdges.push({ id: `gate-out-${gateId}-${e.target}`, source: gateId, target: e.target, label: e.label });
  }
  addEdges.push({ id: `gate-in-${afterNodeId}-${gateId}`, source: afterNodeId, target: gateId });

  // De-dupe bridges that anchor splicing already covers.
  const deduped = addEdges.filter(
    (e, i) => addEdges.findIndex((o) => o.source === e.source && o.target === e.target) === i
  );

  return { addNodes: [], addEdges: deduped, removeNodeIds: [], removeEdgeIds };
}

export function applyPlanMutation(plan: Plan, m: PlanMutation): Plan {
  return {
    ...plan,
    nodes: [...plan.nodes.filter((n) => !m.removeNodeIds.includes(n.id)), ...m.addNodes],
    edges: [...plan.edges.filter((e) => !m.removeEdgeIds.includes(e.id)), ...m.addEdges],
  };
}
