/**
 * Scope B — shadow commit lifecycle. The plumbing wrappers live in git-plumbing.ts.
 */

import { GhostUsageError } from "./errors.js"
import type { RepoContext } from "./git-plumbing.js"

export type ShadowSnapshot = {
  ref: string
  commit: string
  command: string
}

export const runGhostTest = async (
  _repo: RepoContext,
  _command?: string,
): Promise<ShadowSnapshot> => {
  throw new GhostUsageError("git ghost test is not implemented yet")
}

export const rewind = async (
  _repo: RepoContext,
  _selector?: string,
): Promise<ShadowSnapshot> => {
  throw new GhostUsageError("git ghost rewind is not implemented yet")
}

export const listShadows = async (_repo: RepoContext): Promise<ShadowSnapshot[]> => []
