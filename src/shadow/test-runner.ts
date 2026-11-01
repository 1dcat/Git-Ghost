/**
 * Scope B — shadow/test-runner
 *
 * `git ghost test [cmd]`.
 * Run the command with sh -c from the repository root.
 * Exit 0 delegates to snapshot.ts. Any other status writes no shadow
 * ref and is returned as the process status.
 *
 * Scaffold only. Implementation is intentionally absent.
 */
