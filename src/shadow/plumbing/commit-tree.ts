/**
 * Scope B — shadow/plumbing/commit-tree
 *
 * `git commit-tree <tree> -p <parent> -m <message>`.
 * First shadow parents to HEAD. Later shadows parent to the previous
 * shadow. Unborn HEAD omits -p. Message records branch, head, command,
 * and exit status.
 *
 * Scaffold only. Implementation is intentionally absent.
 */
