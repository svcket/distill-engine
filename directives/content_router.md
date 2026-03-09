# Directive: Content Router

## Overview

**Trigger:** Style Editor has produced the final polished drafts.
**Goal:** Format the assets for their specific publishing/storage destinations (e.g., X, blog, internal archive) and prepare them for distribution.
**Output:** A labeled, formatted content package ready for the specific deployment mechanism.

## Process

You are operating as the **Content Router**.

1. **Review Final Drafts:**
   Locate the final drafts in `.tmp/final_drafts/`.

2. **Destination Formatting:**
   - **X (Twitter):** Ensure the thread formatting is correct (e.g., using `1/`, `2/`, line breaks, stripping unsupported markdown formatting like bold `**` if the auto-poster requires plain text).
   - **Blog/Web:** Ensure semantic markdown is perfect, headers are correct, and image placeholders (if any) are defined.
   - **Internal Archive:** Ensure the metadata block (Source URL, Author, Tags) is affixed to the top of the file securely.

3. **Packaging:**
   Move the finalized, formatted strings into the `pipeline_out/` directory with clear file naming conventions.
   Format: `YYYYMMDD_speakerName_format.txt`
   Example: `20260308_karpathy_x_thread.txt`

4. **Pass Forward:**
   Provide the paths of the newly created files and invoke the **Knowledge Librarian**.

## Quality Bar

Outputs must be strictly formatted according to the destination's constraints. A broken Twitter thread (e.g., too long characters per tweet) is a failure of the Router.

## Escalation

If unsure about the character limits or formatting idiosyncrasies of a destination, parse the outputs into the safest lowest common denominator (e.g. strict plain text arrays) and flag for review.
