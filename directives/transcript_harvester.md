# Directive: Transcript Harvester

## Overview

**Trigger:** Source Judge has approved a video for processing.
**Goal:** Obtain a reliable, usable transcript of the approved video, preserving timestamps if possible.
**Output:** The raw transcript (preferably with timestamps), a status flag, and a confidence note.

## Process

You are operating as the **Transcript Harvester**.

1. **Attempt Built-in Retrieval:**
   First, try to pull the native YouTube captions/transcript via `execution/youtube_transcript.py`.

2. **Evaluate the Transcript:**
   - Are the captions auto-generated and full of obvious errors? (Note this down).
   - Are captions completely disabled or missing?

3. **Fallback Actions:**
   If the native transcript is missing or complete junk, note the failure mode. (In the future, this is where we would trigger an audio-rip and Whisper transcription script in `execution/`). For now, if no script exists to bypass the error, flag the source as "Transcript Unavailable."

4. **Format and Store:**
   Save the raw transcript to `.tmp/raw_transcripts/` using the video ID as the filename (e.g., `.tmp/raw_transcripts/dQw4w9WgXcQ.json`).

5. **Pass Forward:**
   Provide the path to the raw transcript and invoke the **Transcript Refiner**.

## Execution Tools

- `execution/youtube_transcript.py` (Intended: utilizes `youtube-transcript-api` or `yt-dlp` to grab the captions as JSON/text).

## Quality Bar

The raw transcript must be complete enough for structured analysis. If missing large chunks of audio, or if the speaker segmentation is so incredibly noisy it's unreadable, flag it with low confidence.
