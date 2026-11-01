/**
 * Scope B — `git ghost test [cmd]`.
 */

import { openRepo } from "../core/git-plumbing.js"
import { runGhostTest } from "../core/shadow-manager.js"

export const runTest = async (cmd: string[]): Promise<void> => {
  const command = cmd.join(" ").trim()
  const repo = await openRepo()
  await runGhostTest(repo, command.length === 0 ? undefined : command)
}
