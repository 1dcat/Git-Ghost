/**
 * Scope A — exit codes shared by every Git-Ghost command.
 * A failing `git ghost test` command passes its own status through
 * and does not use these error classes.
 */

export const ExitCode = {
  success: 0,
  failure: 1,
  usage: 2,
  rewindAborted: 3,
} as const

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode]

export class GhostError extends Error {
  readonly exitCode: ExitCode

  constructor(message: string, exitCode: ExitCode, options?: ErrorOptions) {
    super(message, options)
    this.name = new.target.name
    this.exitCode = exitCode
  }
}

/** Blame, model, or Git plumbing failure. */
export class GhostFailureError extends GhostError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, ExitCode.failure, options)
  }
}

/** Unknown command, bad arguments, or invalid environment. */
export class GhostUsageError extends GhostError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, ExitCode.usage, options)
  }
}

/** Rewind stopped before the worktree changed, or rolled back to its backup. */
export class GhostRewindError extends GhostError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, ExitCode.rewindAborted, options)
  }
}
