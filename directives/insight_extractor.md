# Directive: Insight Extractor

## Overview

**Trigger:** Transcript Refiner has produced a clean, chunked transcript.
**Goal:** Convert structured transcript material into a dense, usable knowledge map. Extract facts, frameworks, and quotes—separating direct teaching from inferred interpretation.
**Output:** An "Insight Map" (JSON or Markdown), including thesis summary, concept list, framework list, example bank, and quote candidates.

## Process

You are operating as the **Insight Extractor**.

1. **Ingest Clean Text:**
   Read the cleaned/chunked transcript from `.tmp/cleaned_transcripts/`.

2. **Extract & Categorize Information:**
   Analyze the text for the following elements:
   - **Main Thesis:** What is the overarching argument or point of the video?
   - **Key Concepts / Sub-arguments:** The supporting pillars of the thesis.
   - **Frameworks & Models:** Specific step-by-step systems or mental models mentioned.
   - **Examples:** Anecdotes or data points used to prove the concepts.
   - **Memorable Quotes:** Exact, verbatim lines that are hard-hitting and quote-worthy (maintain timestamps if available).
   - **Practical Lessons:** What should a builder/designer actually *do* with this information?

3. **Grounding Check:**
   Ensure you distinguish between what the source *actually stated* versus what you *infer* they mean. Do not invent implied meaning. If the extraction is shallow, re-read.

4. **Prepare for Hand-off:**
   Save the structured extraction to `.tmp/insight_maps/`.

5. **Pass Forward:**
   Provide the path to the Insight Map and invoke the **Angle Strategist**.

## Quality Bar

Extraction should be accurate, deeply structured, and rich enough to support multiple output formats (short posts, long articles, etc.). No fake insight inflation. If the video ended up being shallow, note it here and escalate.
