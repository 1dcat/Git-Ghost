/**
 * Scope A — foundation/errors
 *
 * Process exit codes shared by every command:
 *   0  success
 *   1  blame, model, or Git plumbing failure
 *   2  usage error
 *   3  rewind aborted with the worktree unchanged
 * A failing `git ghost test` command passes its own status through.
 *
 * Scaffold only. Implementation is intentionally absent.
 */
