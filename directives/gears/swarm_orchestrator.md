# Swarm Orchestrator Directive

## Goal

Manage the collaborative hand-off between specialized agents to ensure source material is transformed into high-fidelity builder intelligence.

## Operating Principles

1. **Shared Knowledge**: Every agent MUST read from the `Research DAG` before starting a task to see if relevant insights already exist.
2. **Standardized Hand-offs**: Each execution step must output a JSON file in `.tmp/swarm/` that follows the schema defined in `adapters.ts`.
3. **Hypothesis Propagation**: When an agent discovers a strong pattern, it should write it to `.tmp/knowledge_dag/hypotheses.json`.
4. **Warp Compliance**: Agents MUST respect the active `WARP` configuration (found in `.tmp/current_warp.json`).

## Agent Roles

- **Discovery Agent**: Identifies high-signal segments and "real teachings".
- **Synthesis Agent**: Cross-links new segments with existing DAG nodes.
- **Editorial Agent**: Generates content based on the active Warp's tone and depth requirements.

## Workflow

1. **Load Context**: Read DAG + Active Warp.
2. **Execute Tool**: Run the deterministic Python script for the current stage.
3. **Commit Observation**: Update the DAG with new findings.
4. **Eval & Mutate**: Check if the output needs another pass (e.g., if velocity is too low or depth is shallow).
