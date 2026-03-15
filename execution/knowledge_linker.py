import sys
import argparse
import json
import os
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from openai import OpenAI

# Schema for a Research DAG Node
class DAGNode(BaseModel):
    id: str
    type: str # observation, synthesis, hypothesis, experiment
    content: str
    domain: str
    lineage: List[str] # List of source IDs or other Node IDs

    model_config = {"extra": "forbid"}

class Connection(BaseModel):
    source: str
    target: str
    type: str # supports, contradicts, refines, extends, derived_from

    model_config = {"extra": "forbid"}

class KnowledgeLink(BaseModel):
    new_nodes: List[DAGNode] = Field(description="New insights found in this source that should be added to the DAG.")
    connections: List[Connection] = Field(description="Edges linking new nodes to existing nodes in the DAG.")

    model_config = {"extra": "forbid"}

def load_json(filepath: str):
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except: pass
    return None

def link_knowledge(insights_path: str, dag_path: str):
    if not os.path.exists(insights_path):
        print(json.dumps({"status": "failed", "error": f"Insights not found: {insights_path}"}), file=sys.stderr)
        sys.exit(1)
        
    insights = load_json(insights_path)
    dag = load_json(dag_path) or {"nodes": [], "edges": []}
    
    source_id = insights.get("source_id")
    data = insights.get("data", {})
    
    apiKey = os.environ.get("OPENAI_API_KEY")
    if not apiKey or apiKey.startswith("sk-xxxx"):
        # Mock fallback for UI/Local testing
        # If Source B is processed, we mock a connection to Source A
        mock_nodes = []
        mock_edges = []
        
        node_id = f"node_{source_id}_obs"
        mock_nodes.append({
            "id": node_id,
            "type": "observation",
            "content": data.get("core_argument", "Observation from source"),
            "domain": "general",
            "lineage": [source_id]
        })
        
        # Detect cross-pollination in mock mode
        if source_id == "source_b" and any(n["id"] == "node_source_a_obs" for n in dag["nodes"]):
            # Create a synthesis node
            synthesis_id = "synth_ab_1"
            mock_nodes.append({
                "id": synthesis_id,
                "type": "synthesis",
                "content": "Combined insight: Scaling distributed agents requires decoupled intelligence routing.",
                "domain": "infrastructure",
                "lineage": ["node_source_a_obs", node_id]
            })
            mock_edges.append({"source": node_id, "target": "node_source_a_obs", "type": "extends"})
            mock_edges.append({"source": synthesis_id, "target": node_id, "type": "derived_from"})

        mock_result = {
            "status": "success_mocked",
            "new_nodes": mock_nodes,
            "connections": mock_edges
        }
        
        # Merge with DAG
        dag["nodes"].extend(mock_result["new_nodes"])
        dag["edges"].extend(mock_result["connections"])
        os.makedirs(os.path.dirname(dag_path), exist_ok=True)
        with open(dag_path, 'w', encoding='utf-8') as f:
            json.dump(dag, f, indent=2)
            
        print(json.dumps(mock_result))
        sys.exit(0)

    client = OpenAI()
    
    # Existing knowledge context
    existing_nodes = "\n".join([f"- [{n['id']}]: {n['content']}" for n in dag["nodes"][-20:]]) # Last 20 for context
    
    system_prompt = f"""
    You are the AutoThinker Loop—the synthesis core of the Research DAG.
    Your task is to integrate new insights from a source into the global knowledge graph.
    
    EXISTING CONTEXT:
    {existing_nodes if dag["nodes"] else "No existing nodes in DAG."}
    
    CRITICAL RULES:
    1. Identify if the new core argument or claims link to existing nodes.
    2. Create connections (supports, contradicts, refines, extends).
    3. Generate new 'synthesis' nodes if the combination of old and new data yields a new insight.
    4. Maintain the lineage chain.
    """
    
    user_content = f"New insights from {source_id}:\n{json.dumps(data, indent=2)}"
    
    try:
        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            response_format=KnowledgeLink,
        )
        
        result = completion.choices[0].message.parsed
        result_dict = json.loads(result.model_dump_json())
        
        # Merge into DAG
        dag["nodes"].extend(result_dict["new_nodes"])
        dag["edges"].extend(result_dict["connections"])
        
        os.makedirs(os.path.dirname(dag_path), exist_ok=True)
        with open(dag_path, 'w', encoding='utf-8') as f:
            json.dump(dag, f, indent=2)
            
        print(json.dumps(result_dict))
        
    except Exception as e:
        print(json.dumps({"status": "failed", "error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Link new insights into the Research DAG.")
    parser.add_argument("--insights", required=True, help="Path to new insights JSON.")
    parser.add_argument("--dag", required=True, help="Path to global DAG JSON.")
    
    args = parser.parse_args()
    link_knowledge(args.insights, args.dag)
