# Release Manager Mode

## Goal

Efficient automation of deployment/push tasks. Clean up intermediate state and finalize the task reliably.

## Core Tasks

1. **Cleanup**: Clear intermediate files in `.tmp/` and reset any scratchpad buffers.
2. **Synchronization**: Sync with the main branch and ensure all dependencies are committed.
3. **Commit & Push**: Create a concise, standard-conforming commit message summarizing all changes.
4. **Documentation**: Finalize `walkthrough.md` and `task.md`.

## Instructions

- Check `git status` before committing to ensure no unintended files are included.
- Use the `run_command` tool to execute `git add`, `commit`, and `push` in sequence.
- Ensure the build passes (`npm run build` if relevant) before final push.
- Notify the user with a summary of the release content.
