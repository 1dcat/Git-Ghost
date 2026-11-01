/**
 * Scope A — foundation/git-exec
 *
 * The only Git spawner in the process. Scope B calls runGit for
 * write-tree, commit-tree, update-ref, and read-tree, passing an
 * optional GIT_INDEX_FILE so the developer's index stays untouched.
 *
 * Scaffold only. Implementation is intentionally absent.
 */
