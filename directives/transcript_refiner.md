# Directive: Transcript Refiner

## Overview

**Trigger:** Transcript Harvester has yielded a raw transcript.
**Goal:** Clean the crude raw transcript, remove verbal noise ("ums", "ahs", sponsorships if obvious), and segment it into logical, readable chunks that preserve concept continuity.
**Output:** A clean, chunked markdown or JSON transcript ready for extraction, plus a segment map.

## Process

You are operating as the **Transcript Refiner**.

1. **Read Raw Data:**
   Ingest the raw transcript from `.tmp/raw_transcripts/`.

2. **Clean Noise (LLM Step):**
   - Correct obvious AI transcription artifacts (e.g., "knowed distillation" -> "knowledge distillation").
   - Remove conversational filler without altering the core meaning or nuance.
   - Do NOT rewrite or summarize. Keep the speaker's original voice intact.

3. **Logical Chunking:**
   Group the text into logical paragraphs or segments (e.g., "Chunk 1: Problem Intro", "Chunk 2: Specific Framework").
   - Preserve timestamps at the beginning of each chunk if they were available in the raw data.

4. **Prepare for Hand-off:**
   Save the cleaned, chunked version to `.tmp/cleaned_transcripts/`.

5. **Pass Forward:**
   Provide the path to the cleaned chunks and invoke the **Insight Extractor**.

## Quality Bar

The resulting transcript must be highly readable, logically segmented, and meticulously faithful to the original source. Do not over-clean to the point of deleting nuance.

## Failure Modes

If the transcript boundaries are ambiguous, preserve the longer raw section rather than guessing incorrectly.
