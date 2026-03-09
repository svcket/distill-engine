# skill_curator

## Purpose

Read the project context, directives, and NorthStarProfile, then infer and define the modular skills required to operate the system reliably.

This file exists to generate and maintain `skills.md`.

It should convert project needs into reusable capabilities with:

- clear responsibilities
- triggers
- inputs
- outputs
- dependencies
- quality bars
- failure modes

---

## Inputs

The curator should read, in order of priority:

1. `AGENTS.md`
2. `NorthStarProfile.md`
3. all files in `directives/`
4. any existing `skills.md`
5. relevant execution scripts in `execution/`

---

## Core Understanding

`AGENTS.md` defines the universal operating architecture:

- Directive
- Orchestration
- Execution

`NorthStarProfile.md` defines project taste, audience, standards, and target outcome.

`directives/` define the actual SOPs.

`skill_curator.md` must translate those materials into modular skills that help orchestration become repeatable, reliable, and high quality.

---

## What Counts As A Skill

A skill is a reusable operational capability with:

- a specific purpose
- a clear activation condition
- defined inputs
- a repeatable process
- defined outputs
- a measurable quality bar
- known dependencies
- known failure conditions

A skill is not:

- a vague idea
- a generic role title with no behavior
- a duplicate of another skill
- a full directive rewritten as fluff

---

## Skill Creation Principles

### 1. Create for recurring work

Only create skills for repeatable responsibilities that appear more than once in the workflow or clearly deserve modularity.

### 2. Prefer sharp scope

A skill should do one thing well.
Do not create bloated mega-skills that own half the workflow.

### 3. Respect the 3-layer system

Skills belong primarily to orchestration.
They may call directives and execution tools, but they are not replacements for either.

### 4. Align to NorthStarProfile

Skills must optimize for the project’s actual quality bar, tone, audience, and transformation standards.

### 5. Prefer deterministic execution when possible

If a responsibility can be handled by a reliable script, tool, or repeatable procedure, the skill should route there rather than improvising unnecessarily.

### 6. Avoid duplication

If two skills overlap heavily, merge or clearly separate them.

### 7. Design for composition

Skills should be chainable.
Outputs from one skill should be usable by downstream skills.

---

## What To Extract From Project Files

From `AGENTS.md`, extract:

- operating philosophy
- routing behavior
- self-annealing expectations
- execution preference rules

From `NorthStarProfile.md`, extract:

- audience
- tone
- quality standards
- transformation requirements
- output expectations

From `directives/`, extract:

- repeatable workflow tasks
- common decision points
- validation checks
- edge cases
- dependencies between steps

From `execution/`, extract:

- available deterministic tooling
- tool names
- tool purposes
- script constraints
- existing automation capabilities

---

## Required Output Structure For Each Skill

Every skill in `skills.md` must contain:

### Skill Name

Short, clear, operational.

### Purpose

What the skill exists to do.

### When Invoked

The trigger condition.

### Inputs

What the skill requires.

### Process

Step-by-step behavior.

### Outputs

What the skill must return or produce.

### Quality Bar

What good looks like.

### Dependencies

Files, directives, tools, or upstream skills it depends on.

### Failure Modes

What can go wrong.

### Escalation / Recovery

What to do if the skill fails, lacks data, or hits uncertainty.

---

## Skill Inference Process

### Step 1: Map the workflow

Identify the full project workflow from source intake to final output.

### Step 2: Identify decision-heavy responsibilities

Find the tasks where intelligent routing, judgment, or structured transformation is needed.

### Step 3: Identify repeatable modules

Turn those responsibilities into modular skills.

### Step 4: Remove duplicates

Merge overlapping skills and sharpen boundaries.

### Step 5: Order dependencies

Map which skills feed others.

### Step 6: Write the skill definitions

Generate `skills.md` in a practical, usable format.

### Step 7: Validate against North Star

Check that the resulting skill system supports the project’s actual audience, quality bar, and outcomes.

---

## Curation Heuristics

When deciding whether a skill should exist, ask:

- Is this responsibility recurring?
- Does it involve judgment or routing?
- Would modularizing it improve reliability?
- Does it have clearly defined inputs and outputs?
- Does it align with the actual workflow?
- Does it meaningfully reduce ambiguity for the orchestration layer?

If no, do not create the skill.

---

## Project-Specific Expectation For This System

For this knowledge distillation and editorial engine, likely skill families include:

- source discovery
- source evaluation
- transcript acquisition
- transcript cleaning/chunking
- insight extraction
- angle selection
- content architecture
- writing
- fact checking
- style editing
- routing/export
- knowledge storage
- performance learning

These should be refined into a final skill map based on the directives.

---

## Maintenance Rules

When the workflow changes:

- update `directives/` first
- then re-evaluate `skills.md`
- add, remove, merge, or sharpen skills as necessary

Do not create new skills unnecessarily.
Do not preserve obsolete skills for sentimental reasons.
The skill system should reflect the actual operating model of the project.

---

## Final Objective

Create a `skills.md` that makes orchestration clearer, more modular, more reliable, and more aligned with the project’s North Star.
