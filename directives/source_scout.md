# Directive: Source Scout

## Overview

**Trigger:** You (the Orchestrator) need to identify promising new video sources to process.
**Goal:** Perform discovery across Youtube channels to find relevant, high-signal videos matching the NorthStarProfile.
**Output:** A list of candidate video URLs along with their metadata (title, channel, publish date, view count).

## Process

You are operating as the **Source Scout**.

1. **Check Whitelists & Topic Scope:**
   Review `North_Star_profile.md` for the current priority topic areas (e.g., AI, vibe coding, product design, startups) and preferred sources.

2. **Execute Discovery:**
   *If a script exists:* Run `execution/youtube_scout.py` (or similar) with the relevant topic keywords or channel IDs.
   *If manual:* Request the user for a batch of URLs, or use available search tools.

3. **Initial Filtering (The "Sniff Test"):**
   Eliminate obvious junk based on the metadata:
   - Is it pure clickbait? ("Top 10 ways to get rich quick") -> *Reject*
   - Is it too short to have depth (< 3 mins)? -> *Reject*
   - Is it from an unauthorized or low-quality source? -> *Reject*

4. **Group and Format Candidates:**
   Organize the remaining candidate videos by topic/theme.

5. **Pass Forward:**
   Output the candidate list and prepare to pass it to the **Source Judge** for rigorous evaluation.

## Execution Tools

- `execution/youtube_scout.py` (Intended: queries YouTube API for channel uploads or keyword search)

## Quality Bar

Do not pass along garbage. Err on the side of rejecting a source if the title strongly suggests shallow "top 5 lessons" energy. Candidates should be relevant, credible, and likely to yield meaningful written output.
