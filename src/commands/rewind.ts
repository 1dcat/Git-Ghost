/**
 * Scope B — `git ghost rewind [selector]`.
 */

import { GhostUsageError } from "../core/errors.js"
import { openRepo } from "../core/git-plumbing.js"
import { rewind, type Snapshot } from "../core/shadow-manager.js"
import { log } from "../utils/terminal.js"

const printList = (snapshots: Snapshot[]): void => {
  if (snapshots.length === 0) {
    log("no shadow snapshots yet")
    return
  }
  process.stdout.write(`${"REF".padEnd(56)} ${"WHEN".padEnd(24)} COMMAND\n`)
  for (const snapshot of snapshots) {
    process.stdout.write(
      `${snapshot.ref.padEnd(56)} ${snapshot.createdAt.padEnd(24)} ${snapshot.command}\n`,
    )
  }
}

const worktreeLine = (label: "latest" | "older" | "exact" | "backup"): string => {
  if (label === "backup") return "worktree matches the pre-rewind backup"
  if (label === "latest") return "worktree matches the last passing snapshot"
  return "worktree matches that snapshot"
}

export const runRewind = async (args: string[]): Promise<void> => {
  const list = args.includes("--list")
  const undo = args.includes("--undo")
  const rest = args.filter((arg) => arg !== "--list" && arg !== "--undo")
  if (list && (undo || rest.length > 0)) {
    throw new GhostUsageError("usage: git ghost rewind [--list | --undo | latest | <n> | <ref>]")
  }
  if (undo && rest.length > 0) {
    throw new GhostUsageError("usage: git ghost rewind [--list | --undo | latest | <n> | <ref>]")
  }

  const selector = list ? "--list" : undo ? "--undo" : rest[0]
  const repo = await openRepo()
  const result = await rewind(repo, selector)
  if (result.kind === "list") {
    printList(result.snapshots)
    return
  }

  log(`backup  ${result.backupRef}`)
  log(`restore ${result.ref}`)
  const branch = result.branch ?? "detached HEAD"
  const head = result.head ? result.head.slice(0, 7) : "unborn"
  process.stdout.write(`${worktreeLine(result.label)}\n`)
  process.stdout.write(`branch ${branch} still points at ${head}\n`)
}
