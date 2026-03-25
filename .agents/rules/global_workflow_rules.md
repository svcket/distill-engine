# 🌐 Global Workflow Rules

This system-wide rule governs all Antigravity sessions on this machine. It establishes the **Master Orchestration Protocol** for the 144+ agent agency structure.

---

## ⚡ 1. Default Behavior: Efficiency First
> [!IMPORTANT]
> **Auto-Detect Protocol**: Handle 90% of requests (coding, debugging, chat) naturally. Do not activate heavy workflows for trivial tasks. Tools enhance judgment; they do not replace it.

---

## 🏗️ 2. The 3-Layer Architecture
Work is partitioned across three distinct layers to ensure both flexibility and mechanical precision:

1. **Layer 1: Master Orchestration** (Reasoning & Intent)
   - *Goal*: Align with the North Star. Formulate the Idea Brief.
2. **Layer 2: Specialist Directives** (Domain Mindsets)
   - *Goal*: Execute within a specific role (e.g., Architect, Builder).
3. **Layer 3: Operations** (Deterministic Tasks)
   - *Goal*: Run repetitive terminal/file operations with zero drift.

---

## 🔄 3. Operational Stage Gates
**Sequence**: `idea -> outcome -> system -> phase -> role -> execution -> validation -> iteration`

| Stage | Path | Entry Requirement |
| :--- | :--- | :--- |
| **Capture** | `ideas/` | A problem worth exploring has been identified. |
| **Design** | `systems/` | A clear problem statement + hypothesis exists. |
| **Success** | `outcomes/` | **The Gate**: No code until success criteria are defined. |
| **Build** | `build/` | Metric + baseline + target are established. |
| **Validate** | `validation/` | Build is live and has data. |
| **Improve** | `iteration/` | Verdict is "ship" or "pivot." |

---

## 🌟 4. Recursive North Star Looping (Building from Ground Up)
Every task, regardless of scope, must be broken down into measurable sub-units that sync back to the Product North Star.

### **The North Star Breakdown (Per-Task)**
Before executing any task, the agent must define:
1. **The Task North Star**: What single outcome defines "Mission Accomplished" for this specific step?
2. **Mini-Goals**: Breakdown the task into 3-5 sub-tasks.
3. **Bounded Acceptance Criteria (AC)**: Every mini-goal must define:
   - **Must**: Essential functional requirements (Binary Pass/Fail).
   - **Should**: Desired behavioral/quality standards.
   - **Must Not**: Prohibited actions or side-effects.

### **The 100% Achievement Loop**
> [!IMPORTANT]
> **Recursive Validation**: The agent **MUST** enter a verification loop after execution. 
> 1. Run validation tools (tests, linters, visual audits).
> 2. Compare results against the **Must** and **Should** criteria.
> 3. If any **Must** criterion fails, or a **Must Not** occurs, the agent MUST return to EXECUTION.
> 4. Do NOT report completion until 100% of **Must** criteria are met.

### **Product Alignment**
- All Task North Stars must explicitly contribute to the **Product North Star Profile**. 
- If a task doesn't move a core metric (Breadth, Depth, Efficiency, Quality), it is rejected.

---

## 🎭 5. Specialist Roster (Division Mapping)
Reference these specialists by name when the task clearly fits their domain.

| Agent | Responsibility | Use When |
| :--- | :--- | :--- |
| `orchestrator` | Routes tasks, enforces sequences. | Starting any multi-step feature. |
| `product-manager` | Feature planning + North Star gatekeeper. | Before scope is locked. |
| `system-architect` | Designs architecture before implementation. | Before any backend work starts. |
| `builder` | High-fidelity (React/Nodes/TS) implementation. | Performing complex coding tasks. |
| `qa-engineer` | Feature flows, APIs, and mobile testing. | After implementation, before merge. |
| `security-analyst` | Hard gate for payment/auth/API logic. | Critical security reviews. |

---

## 🛠️ 6. System Working Rules
- **Security First**: **NEVER** hardcode keys, secrets, or tokens. **NEVER** commit secrets to version control (GitHub).
- **Environment**: All secrets MUST reside in a `.env` file (e.g., `~/workflow-kit/.env`).
- **Persistence**: After any workflow change, commit to `~/workflow-kit`.
- **Identity**: Rules are global and account-agnostic (stored in `~/.gemini/`).
- **Mechanical Discipline**: No code before spec. No spec before problem definition.

---

## 📐 7. Component Scale & Overrides
- **Global Architecture**: Use `workflow-kit/untitled-ui` as the baseline.
- **Workspace Centered**: Projects MAY override global tokens (e.g., `CORNER_RADIUS`, `THEME_PRIMARY`).
- **8-Point Grid Protocol**: **MANDATORY**. All spacing (padding, gaps, margins) and typography MUST follow an 8pt base scale (8, 16, 24, 32, 48, 64). 
    - Use 4pt nuances ONLY when specifically requested or for micro-interactions.
- **Ground-Up Protocol**: Primitives (Buttons, Inputs) are global; Layouts and Logic are workspace-specific.

---
