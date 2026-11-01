/**
 * Scope B — `git ghost rewind [selector]`.
 */

import { openRepo } from "../core/git-plumbing.js"
import { rewind } from "../core/shadow-manager.js"

export const runRewind = async (args: string[]): Promise<void> => {
  const selector = args.join(" ").trim()
  const repo = await openRepo()
  await rewind(repo, selector.length === 0 ? undefined : selector)
}
