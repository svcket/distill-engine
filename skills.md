# skills

## 1. Source Scout

### Purpose

Identify promising YouTube videos, channels, and speakers worth evaluating for content transformation.

### When Invoked

Invoke when:

- monitoring source channels
- searching for new content in approved topic areas
- refreshing the candidate content pipeline
- expanding source coverage

### Inputs

- topic scope
- source whitelist
- search keywords
- platform/channel metadata
- recent processing history

### Process

1. search approved sources and relevant channels
2. collect metadata for candidate videos
3. eliminate obviously irrelevant or low-signal content
4. group candidates by topic/theme
5. pass candidates forward for evaluation

### Outputs

- candidate source list
- metadata bundle
- topical grouping
- discovery notes

### Quality Bar

Candidates should be relevant, credible, and likely to yield meaningful written output.

### Dependencies

- source directives
- source whitelist
- discovery scripts or APIs

### Failure Modes

- irrelevant search results
- low-quality channels
- duplicate discoveries
- overbroad topical matching

### Escalation / Recovery

Tighten keyword scope, rely more heavily on whitelists, or defer uncertain items to Source Judge.

---

## 2. Source Judge

### Purpose

Evaluate whether a source video is worth processing.

### When Invoked

Invoke after discovery and before transcript acquisition.

### Inputs

- source metadata
- channel/speaker information
- topic relevance signals
- prior coverage history

### Process

1. evaluate speaker/channel credibility
2. assess relevance to project topic scope
3. estimate practical density and insight quality
4. check duplication against prior processed themes
5. approve, reject, or defer

### Outputs

- decision status
- source score
- rationale
- suggested content angles
- novelty notes

### Quality Bar

Only approve sources that are credible, relevant, non-trivial, and likely to produce useful editorial assets.

### Dependencies

- NorthStarProfile
- source scoring directive
- knowledge history

### Failure Modes

- approving shallow content
- rejecting useful but less obvious content
- duplicate thematic coverage
- over-indexing on popularity

### Escalation / Recovery

Mark uncertain sources as deferred and route for manual review if needed.

---

## 3. Transcript Harvester

### Purpose

Obtain usable transcript material from approved source videos.

### When Invoked

Invoke after a source is approved.

### Inputs

- video URL or ID
- transcript/caption access method
- audio retrieval method if applicable

### Process

1. attempt to retrieve existing captions/transcript
2. if unavailable, use approved transcription method
3. normalize formatting
4. preserve timestamps when possible
5. package transcript for downstream processing

### Outputs

- raw transcript
- timestamped transcript
- transcript status
- transcription confidence note

### Quality Bar

Transcript should be sufficiently complete and intelligible for structured analysis.

### Dependencies

- transcript directives
- approved execution tools
- source metadata

### Failure Modes

- missing captions
- low-quality transcript
- timestamp loss
- noisy speaker segmentation

### Escalation / Recovery

Flag low-confidence transcripts and send to Transcript Refiner or manual review.

---

## 4. Transcript Refiner

### Purpose

Clean, segment, and structure transcripts for analysis.

### When Invoked

Invoke after transcript acquisition and before insight extraction.

### Inputs

- raw transcript
- timestamps
- source metadata

### Process

1. remove noise and junk text
2. correct obvious transcript artifacts
3. segment transcript into logical chunks
4. preserve concept continuity
5. prepare transcript for extraction and storage

### Outputs

- cleaned transcript
- structured chunks
- segment map
- refinement notes

### Quality Bar

Transcript should be readable, logically segmented, and faithful to the source.

### Dependencies

- transcript processing directive
- harvester outputs

### Failure Modes

- over-cleaning and losing meaning
- poor chunking boundaries
- deleting nuance
- incorrect paragraph grouping

### Escalation / Recovery

Preserve raw transcript alongside refined version and note ambiguities.

---

## 5. Insight Extractor

### Purpose

Convert structured transcript material into usable knowledge.

### When Invoked

Invoke after transcript refinement.

### Inputs

- cleaned transcript
- transcript chunks
- source metadata
- source decision notes

### Process

1. identify main thesis
2. extract key concepts and sub-arguments
3. identify frameworks, models, and examples
4. extract memorable lines or quotable insights
5. capture practical lessons and unresolved questions
6. distinguish source teaching from inferred interpretation

### Outputs

- insight map
- thesis summary
- concept list
- framework list
- example bank
- quote candidates
- practical takeaway notes

### Quality Bar

Extraction should be accurate, structured, useful, and rich enough to support multiple output formats.

### Dependencies

- extraction directive
- refined transcript
- NorthStarProfile

### Failure Modes

- shallow extraction
- missing core argument
- inventing implied meaning
- confusing source claims with interpretation

### Escalation / Recovery

Return to transcript chunks and rebuild extraction with stronger grounding.

---

## 6. Angle Strategist

### Purpose

Decide the strongest framing and output direction for the source material.

### When Invoked

Invoke after insight extraction and before outlining.

### Inputs

- insight map
- NorthStarProfile
- target audience
- output format options
- prior coverage history

### Process

1. assess what is most valuable about the source
2. determine likely audience fit
3. choose the strongest framing angle
4. decide whether content should be short, long, or serialized
5. recommend output mix

### Outputs

- chosen angle
- audience fit note
- format strategy
- headline direction
- framing rationale

### Quality Bar

The chosen angle should make the source more relevant, readable, and useful without distorting it.

### Dependencies

- insight outputs
- NorthStarProfile
- output directives

### Failure Modes

- generic angle selection
- mismatch between source and format
- over-sensational framing
- forcing virality over clarity

### Escalation / Recovery

Generate 2–3 alternate angles and choose the one with strongest clarity and usefulness.

---

## 7. Article Architect

### Purpose

Design the structure of the written outputs before drafting.

### When Invoked

Invoke after angle selection and before writing.

### Inputs

- chosen angle
- insight map
- target formats
- voice rules

### Process

1. define hook
2. define article or thread structure
3. sequence ideas logically
4. separate direct teaching from original synthesis
5. plan section headers and transitions
6. prepare structure for each requested format

### Outputs

- outline
- section plan
- thread skeleton
- series map if needed
- headline options

### Quality Bar

The structure should be clear, compelling, and capable of carrying dense ideas without confusion.

### Dependencies

- angle strategy
- article generation directives
- NorthStarProfile

### Failure Modes

- weak structure
- buried lead
- repetitive sectioning
- poor sequencing of ideas

### Escalation / Recovery

Restructure around the strongest thesis, key tension, or most actionable takeaway.

---

## 8. Writer

### Purpose

Draft the requested written assets.

### When Invoked

Invoke after architecture is approved.

### Inputs

- outline
- insight map
- source-grounding notes
- target format
- tone guidance

### Process

1. write to the chosen format
2. preserve source fidelity
3. add original synthesis where appropriate
4. keep tone aligned to NorthStarProfile
5. produce drafts for all requested outputs

### Outputs

- short article draft
- long article draft
- article series draft(s)
- X thread draft
- short post drafts
- supporting copy variants

### Quality Bar

Drafts should be readable, structured, grounded, and feel genuinely worth publishing.

### Dependencies

- article architecture
- writing directives
- NorthStarProfile

### Failure Modes

- generic tone
- transcripty writing
- bloated copy
- loss of nuance
- weak hooks

### Escalation / Recovery

Revise using stronger structural anchors, tighter prose, and better distinction between source material and synthesis.

---

## 9. Fact Guard

### Purpose

Check factual integrity and source fidelity.

### When Invoked

Invoke after drafting and before final polish.

### Inputs

- drafts
- transcript
- insight map
- quote candidates
- source metadata

### Process

1. verify claims against source material
2. verify quotes and attribution
3. identify overstatements or hallucinations
4. flag unsupported assertions
5. produce revision notes or approve

### Outputs

- fact review report
- pass/fail decision
- correction notes
- confidence score

### Quality Bar

No invented claims, no invented quotes, no false specificity, no misleading compression.

### Dependencies

- transcript
- extraction outputs
- editorial review directive

### Failure Modes

- false attribution
- overconfident summary
- implied claims presented as direct claims
- inaccurate quote usage

### Escalation / Recovery

Send draft back to Writer with specific corrections required.

---

## 10. Style Editor

### Purpose

Polish language, rhythm, clarity, and tone without altering meaning.

### When Invoked

Invoke after factual review passes or returns with minor notes.

### Inputs

- verified draft
- tone rules
- output format guidance

### Process

1. remove repetition and dead phrasing
2. sharpen hooks and transitions
3. improve readability and pacing
4. align tone with NorthStarProfile
5. preserve factual integrity while improving prose

### Outputs

- polished draft
- style notes
- alternate headline/hook options if useful

### Quality Bar

The piece should feel confident, premium, readable, and alive.

### Dependencies

- fact-reviewed draft
- tone directives
- NorthStarProfile

### Failure Modes

- over-editing into generic AI prose
- changing meaning during polish
- flattening distinctive voice
- making it more stylish but less useful

### Escalation / Recovery

Revert to last accurate draft and apply lighter editorial polish.

---

## 11. Content Router

### Purpose

Prepare assets for their intended publishing or storage destinations.

### When Invoked

Invoke after final editing.

### Inputs

- final drafts
- destination list
- formatting requirements

### Process

1. convert outputs into destination-specific formats
2. label assets clearly
3. prepare X-ready, markdown-ready, or archive-ready versions
4. route assets to internal storage or publishing queue

### Outputs

- destination-formatted assets
- labeled content package
- archive copy
- publication-ready variants

### Quality Bar

Outputs should be correctly formatted, organized, and ready for use with minimal extra cleanup.

### Dependencies

- routing directive
- content destinations
- asset naming conventions

### Failure Modes

- wrong formatting
- asset confusion
- missing metadata
- incomplete export package

### Escalation / Recovery

Regenerate export package with stricter destination templates.

---

## 12. Knowledge Librarian

### Purpose

Store and organize project knowledge so future outputs improve over time.

### When Invoked

Invoke after processing each source and each final asset.

### Inputs

- source metadata
- transcript chunks
- insight maps
- final drafts
- tags/topics
- performance data when available

### Process

1. archive source and transcript data
2. store extracted insights
3. tag themes, concepts, and speakers
4. link outputs back to source material
5. track prior coverage and repeated themes

### Outputs

- updated knowledge store
- tagged source record
- searchable concept links
- duplication-prevention notes

### Quality Bar

Stored knowledge should be structured, traceable, and reusable.

### Dependencies

- storage directives
- transcript and content outputs

### Failure Modes

- poor tagging
- duplicate records
- weak traceability
- content not linked to source

### Escalation / Recovery

Normalize metadata schema and backfill links between sources and outputs.

---

## 13. Performance Strategist

### Purpose

Learn from output performance and improve future content choices.

### When Invoked

Invoke after publication and after performance data becomes available.

### Inputs

- published assets
- engagement metrics
- topic history
- speaker history
- format history

### Process

1. review what performed well and poorly
2. identify patterns across topic, speaker, format, and framing
3. recommend source and angle adjustments
4. update downstream priorities

### Outputs

- performance summary
- content strategy notes
- recommendation list
- updated prioritization guidance

### Quality Bar

Recommendations should improve source selection, framing quality, and output usefulness over time.

### Dependencies

- analytics availability
- archive history
- publishing records

### Failure Modes

- overreacting to weak signals
- optimizing for vanity metrics
- ignoring long-term value content
- narrowing topic scope too aggressively

### Escalation / Recovery

Balance engagement data with NorthStarProfile and project identity before making strategic changes.

---

## 14. Specialized Expert Roles (The Agency)

### Purpose
Load specialized "personalities" for targeted expert-level tasks beyond the core editorial pipeline.

### Engineering Division
- **Frontend Developer**: Modern web app and UI implementation. [SKILL.md](file:///Users/socket/distill/skills/engineering/frontend-developer/SKILL.md)
- **Backend Architect**: Scalable, secure backend systems and API design. [SKILL.md](file:///Users/socket/distill/skills/engineering/backend-architect/SKILL.md)
- **DevOps Automator**: CI/CD pipelines and infrastructure automation. [SKILL.md](file:///Users/socket/distill/skills/engineering/devops-automator/SKILL.md)
- **Mobile App Builder**: Native and cross-platform mobile development. [SKILL.md](file:///Users/socket/distill/skills/engineering/mobile-app-builder/SKILL.md)

### Design Division
- **UX Architect**: Intuitive user-centered structures and wireframing. [SKILL.md](file:///Users/socket/distill/skills/design/ux-architect/SKILL.md)
- **UI Designer**: High-fidelity UI mockups and design systems. [SKILL.md](file:///Users/socket/distill/skills/design/ui-designer/SKILL.md)

### Marketing Division
- **Growth Hacker**: Viral loops, conversion funnels, and experiments. [SKILL.md](file:///Users/socket/distill/skills/marketing/growth-hacker/SKILL.md)

### Spatial Computing Division
- **XR Interface Architect**: Immersive 3D/AR/VR interaction models. [SKILL.md](file:///Users/socket/distill/skills/spatial-computing/xr-interface-architect/SKILL.md)

### Testing Division
- **Reality Checker**: Critical evaluation of feasibility and logic. [SKILL.md](file:///Users/socket/distill/skills/testing/reality-checker/SKILL.md)
