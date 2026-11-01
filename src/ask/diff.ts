/**
 * Scope A — ask/diff
 *
 * Extract the author hunk via `git show` for the blamed commit.
 * Keep the covering hunk plus one neighbor on each side, capped by
 * GHOST_MAX_DIFF_BYTES. Follow a single `previous` hop when present.
 *
 * Scaffold only. Implementation is intentionally absent.
 */
