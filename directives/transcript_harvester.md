# Directive: Transcript Harvester

## Overview

**Trigger:** Source Judge has approved a video for processing.
**Goal:** Obtain a reliable, usable transcript of the approved video, preserving timestamps if possible.

# Directive: The script outputs a JSON object containing:
- `source_id`: The ID of the source.
- `status`: "success", "error", or "success_mocked" (or "success_stub").
- `json_path`: Absolute path to the raw `[source_id]_raw.json` file.
- `text_path`: Absolute path to the raw `[source_id]_raw.txt` file.
**Output:** The raw transcript (preferably with timestamps), a status flag, and a confidence note.

## Process

You are the **Transcript Harvester**. Your job is to pull the raw conversational data from a validated source.

You leverage the `transcript_harvester.py` script, which uses an adapter pattern to pull transcripts depending on the `source_type`.

### Input
The script expects the following arguments:
- **`source_id`**: The unique identifier for the content.
- **`url`**: (Optional) For direct resolution if needed.

## Process

### 1. Execute `transcript_harvester.py`
Run the script passing the `source_id`.

```bash
python execution/transcript_harvester.py --source-id "source123"
```

### 2. Evaluate the Transcript:
   - Are the captions auto-generated and full of obvious errors? (Note this down).
   - Are captions completely disabled or missing?

### 3. Fallback Actions:
   If the native transcript is missing or complete junk, note the failure mode. (In the future, this is where we would trigger an audio-rip and Whisper transcription script in `execution/`). For now, if no script exists to bypass the error, flag the source as "Transcript Unavailable."

### 4. Format and Store:
   Save the raw transcript to `.tmp/raw_transcripts/` using the video ID as the filename (e.g., `.tmp/raw_transcripts/dQw4w9WgXcQ.json`).

### 5. Pass Forward:
   Provide the path to the raw transcript and invoke the **Transcript Refiner**.

## Execution Tools

- `execution/transcript_harvester.py` (Intended: utilizes `youtube-transcript-api` or `yt-dlp` to grab the captions as JSON/text).

## Quality Bar

The raw transcript must be complete enough for structured analysis. If missing large chunks of audio, or if the speaker segmentation is so incredibly noisy it's unreadable, flag it with low confidence.
