/**
 * Scope B — shadow commit lifecycle. The plumbing wrappers live in git-plumbing.ts.
 */

import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { readFile, rm } from "node:fs/promises"
import { join } from "node:path"

import { GhostRewindError, GhostUsageError } from "./errors.js"
import {
  addAllToIndex,
  checkoutTree,
  commitTree,
  getCommitBody,
  getCommitDate,
  getCommitParent,
  getCommitTree,
  listRefs,
  nameStatus,
  readTree,
  resolveRef,
  updateRef,
  writeTree,
  type RepoContext,
} from "./git-plumbing.js"
import { log } from "../utils/terminal.js"

export type Snapshot = {
  ref: string
  commit: string
  tree: string
  parent: string | null
  branch: string | null
  head: string | null
  command: string
  createdAt: string
}

export type ShadowSnapshot = Snapshot

export type RunGhostTestOptions = {
  stdio?: "inherit" | "pipe"
}

const resolveTestCommand = async (
  repo: RepoContext,
  command?: string,
): Promise<string> => {
  if (command !== undefined && command.trim().length > 0) {
    return command.trim()
  }

  try {
    const pkgPath = join(repo.toplevel, "package.json")
    const raw = await readFile(pkgPath, "utf8")
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> }
    if (pkg.scripts && typeof pkg.scripts.test === "string") {
      return "npm test"
    }
  } catch {
    // ignore
  }

  throw new GhostUsageError(
    'No test command provided and no "test" script found in package.json',
  )
}

const executeCommand = (
  cmd: string,
  cwd: string,
  stdio: "inherit" | "pipe",
): Promise<{ code: number }> => {
  return new Promise((resolve) => {
    const child = spawn(cmd, {
      cwd,
      shell: true,
      env: process.env,
      stdio: stdio === "pipe" ? ["ignore", "pipe", "pipe"] : "inherit",
    })
    child.stdout?.resume()
    child.stderr?.resume()

    child.on("error", () => {
      resolve({ code: 1 })
    })

    child.on("close", (code, signal) => {
      if (signal) {
        resolve({ code: 128 + 15 })
      } else {
        resolve({ code: code ?? 0 })
      }
    })
  })
}

const field = (label: string): string => label.padEnd(9, " ")

const formatPassingTranscript = (
  treeSha: string,
  commitSha: string,
  snapshotRef: string,
  latestRef: string,
  head: string | null,
): string => {
  const headInfo = head
    ? `HEAD is still ${head.slice(0, 7)}. Branch history is unchanged.`
    : "HEAD is unborn. Branch history is unchanged."

  return [
    "",
    "shadow snapshot",
    `${field("tree")}${treeSha.slice(0, 12)}`,
    `${field("commit")}${commitSha.slice(0, 12)}`,
    `${field("ref")}${snapshotRef}`,
    `${field("latest")}${latestRef}`,
    "",
    headInfo,
    "",
  ].join("\n")
}

export const runGhostTest = async (
  repo: RepoContext,
  command?: string,
  options?: RunGhostTestOptions,
): Promise<Snapshot | null> => {
  const testCmd = await resolveTestCommand(repo, command)

  // Step B: Create Temporary Index
  const tempIndex = join(repo.gitDir, `ghost-index-${randomUUID()}`)

  try {
    // Step C: Load Current HEAD State
    if (repo.head !== null) {
      await readTree(repo, repo.head, tempIndex)
    }

    // Step D: git add -A Using Temporary Index
    await addAllToIndex(repo, tempIndex)

    // Step E: Create Tree
    const treeSha = await writeTree(repo, tempIndex)

    // Step F: Run Tests
    log(`running ${testCmd}`)
    const { code } = await executeCommand(
      testCmd,
      repo.toplevel,
      options?.stdio ?? "inherit",
    )

    if (code !== 0) {
      // Step F -> Failed -> Step I: Delete Temporary Index (handled in finally)
      process.stdout.write("\n")
      log("no snapshot written")
      log("refs/ghost/snapshots/latest unchanged")
      process.exitCode = code
      return null
    }

    // Step F -> Passed -> Step G: Create Internal Commit
    const prevSnapshot =
      (await resolveRef(repo, "refs/ghost/snapshots/latest")) ??
      (await resolveRef(repo, "refs/ghost/shadow/latest"))
    const parent = prevSnapshot ?? repo.head ?? undefined

    const commitMessage = [
      `ghost: pass ${testCmd}`,
      "",
      `Branch: ${repo.branch ?? "detached"}`,
      `Head: ${repo.head ?? "unborn"}`,
      `Command: ${testCmd}`,
      "Exit: 0",
    ].join("\n")

    const commitSha = await commitTree(repo, treeSha, commitMessage, parent)

    // Step H: Save Under refs/ghost/snapshots
    const now = new Date()
    const timestamp = now
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "")
    const id = `${timestamp}-${treeSha.slice(0, 7)}`

    const snapshotRef = `refs/ghost/snapshots/${id}`
    const latestRef = "refs/ghost/snapshots/latest"

    await updateRef(repo, snapshotRef, commitSha)
    await updateRef(repo, latestRef, commitSha)

    // Also mirror to refs/ghost/shadow/ for compatibility
    await updateRef(repo, `refs/ghost/shadow/${id}`, commitSha)
    await updateRef(repo, "refs/ghost/shadow/latest", commitSha)

    process.stdout.write(
      `${formatPassingTranscript(treeSha, commitSha, snapshotRef, latestRef, repo.head)}\n`,
    )

    return {
      ref: snapshotRef,
      commit: commitSha,
      tree: treeSha,
      parent: parent ?? null,
      branch: repo.branch,
      head: repo.head,
      command: testCmd,
      createdAt: now.toISOString(),
    }
  } finally {
    // Step I & J: Delete Temporary Index
    try {
      await rm(tempIndex, { force: true })
    } catch {
      // ignore
    }
  }
}

const stampId = (date: Date, tree: string): string => {
  const timestamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
  return `${timestamp}-${tree.slice(0, 7)}`
}

const captureWorktree = async (repo: RepoContext): Promise<string> => {
  const tempIndex = join(repo.gitDir, `ghost-index-${randomUUID()}`)
  try {
    if (repo.head !== null) await readTree(repo, repo.head, tempIndex)
    await addAllToIndex(repo, tempIndex)
    return await writeTree(repo, tempIndex)
  } finally {
    try {
      await rm(tempIndex, { force: true })
    } catch {
      // The backup ref is only written after the tree exists.
    }
  }
}

const writeBackup = async (repo: RepoContext): Promise<{ ref: string, tree: string }> => {
  const tree = await captureWorktree(repo)
  const now = new Date()
  const ref = `refs/ghost/backup/${stampId(now, tree)}`
  const message = [
    "ghost: backup",
    "",
    `Branch: ${repo.branch ?? "detached"}`,
    `Head: ${repo.head ?? "unborn"}`,
    "Command: rewind",
    "Exit: 0",
  ].join("\n")
  const commit = await commitTree(repo, tree, message, repo.head ?? undefined)
  await updateRef(repo, ref, commit)
  await updateRef(repo, "refs/ghost/backup/latest", commit)
  return { ref, tree }
}

const latestSnapshot = async (repo: RepoContext): Promise<string | null> =>
  (await resolveRef(repo, "refs/ghost/snapshots/latest"))
  ?? (await resolveRef(repo, "refs/ghost/shadow/latest"))

const isGhostCommit = async (repo: RepoContext, sha: string): Promise<boolean> => {
  const body = await getCommitBody(repo, sha)
  return body.startsWith("ghost:")
}

const walkBack = async (repo: RepoContext, start: string, hops: number): Promise<string> => {
  let current = start
  for (let step = 0; step < hops; step += 1) {
    const parent = await getCommitParent(repo, current)
    if (parent === null || !(await isGhostCommit(repo, parent))) {
      const count = step + 1
      throw new GhostUsageError(`the shadow chain only has ${count} snapshot${count === 1 ? "" : "s"}`)
    }
    current = parent
  }
  return current
}

const refForCommit = async (repo: RepoContext, sha: string): Promise<string> => {
  const snapshots = await listShadows(repo)
  const snapshot = snapshots.find((entry) => entry.commit === sha)
  if (snapshot) return snapshot.ref
  const backups = await listRefs(repo, "refs/ghost/backup/")
  const backup = backups.find((entry) => entry.sha === sha && !entry.ref.endsWith("/latest"))
  return backup?.ref ?? sha.slice(0, 12)
}

const resolveRewindTarget = async (
  repo: RepoContext,
  selector?: string,
): Promise<{ kind: "list" } | { kind: "tree", commit: string, label: "latest" | "older" | "exact" | "backup" }> => {
  if (selector === "--list") return { kind: "list" }

  if (selector === "--undo") {
    const backups = (await listRefs(repo, "refs/ghost/backup/"))
      .filter((entry) => !entry.ref.endsWith("/latest"))
    const newest = backups[0]
    if (!newest) throw new GhostUsageError("no rewind backup yet")
    return { kind: "tree", commit: newest.sha, label: "backup" }
  }

  if (selector !== undefined && /^\d+$/.test(selector)) {
    const place = Number(selector)
    if (place < 1) throw new GhostUsageError("snapshot number starts at 1")
    const latest = await latestSnapshot(repo)
    if (latest === null) {
      throw new GhostUsageError("no shadow snapshots yet. Run git ghost test when the suite passes.")
    }
    const commit = await walkBack(repo, latest, place - 1)
    return { kind: "tree", commit, label: place === 1 ? "latest" : "older" }
  }

  if (selector !== undefined && selector.startsWith("refs/")) {
    const commit = await resolveRef(repo, selector)
    if (commit === null) throw new GhostUsageError(`${selector} does not exist`)
    return { kind: "tree", commit, label: "exact" }
  }

  if (selector !== undefined && selector !== "latest") {
    throw new GhostUsageError("usage: git ghost rewind [latest | <n> | <ref> | --list | --undo]")
  }

  const latest = await latestSnapshot(repo)
  if (latest === null) {
    throw new GhostUsageError("no shadow snapshots yet. Run git ghost test when the suite passes.")
  }
  return { kind: "tree", commit: latest, label: "latest" }
}

export type RewindResult =
  | { kind: "list", snapshots: Snapshot[] }
  | {
    kind: "restored"
    backupRef: string
    ref: string
    label: "latest" | "older" | "exact" | "backup"
    head: string | null
    branch: string | null
  }

export const rewind = async (
  repo: RepoContext,
  selector?: string,
): Promise<RewindResult> => {
  const target = await resolveRewindTarget(repo, selector)
  if (target.kind === "list") {
    return { kind: "list", snapshots: await listShadows(repo) }
  }

  const tree = await getCommitTree(repo, target.commit)
  if (tree === null) throw new GhostUsageError("that snapshot has no tree")
  const restoredRef = await refForCommit(repo, target.commit)
  const backup = await writeBackup(repo)

  try {
    await checkoutTree(repo, tree)
  } catch (caught) {
    try {
      await checkoutTree(repo, backup.tree)
    } catch (rollback) {
      throw new GhostRewindError(
        `rewind failed and the backup restore failed. Backup ref is ${backup.ref}.`,
        { cause: rollback },
      )
    }
    const reason = caught instanceof Error ? caught.message : "rewind failed"
    throw new GhostRewindError(`${reason} The worktree was restored from ${backup.ref}.`)
  }

  return {
    kind: "restored",
    backupRef: backup.ref,
    ref: restoredRef,
    label: target.label,
    head: repo.head,
    branch: repo.branch,
  }
}

export const listShadows = async (repo: RepoContext): Promise<Snapshot[]> => {
  const entries = [
    ...(await listRefs(repo, "refs/ghost/snapshots/")),
    ...(await listRefs(repo, "refs/ghost/shadow/")),
  ]
  const seen = new Set<string>()
  const snapshots: Snapshot[] = []

  for (const { ref, sha } of entries) {
    if (ref.endsWith("/latest") || seen.has(sha)) continue
    seen.add(sha)
    const body = await getCommitBody(repo, sha)
    if (body.startsWith("ghost: backup")) continue
    const tree = (await getCommitTree(repo, sha)) ?? ""
    const branchMatch = /^Branch:\s*(.+)$/m.exec(body)
    const headMatch = /^Head:\s*(.+)$/m.exec(body)
    const cmdMatch = /^Command:\s*(.+)$/m.exec(body)

    snapshots.push({
      ref,
      commit: sha,
      tree,
      parent: null,
      branch: branchMatch ? branchMatch[1].trim() : null,
      head: headMatch ? headMatch[1].trim() : null,
      command: cmdMatch ? cmdMatch[1].trim() : "test",
      createdAt: await getCommitDate(repo, sha),
    })
  }

  return snapshots
}

export const shadowFiles = async (
  repo: RepoContext,
  ref: string,
): Promise<Array<{ status: string, path: string }>> => {
  const sha = ref.startsWith("refs/") ? await resolveRef(repo, ref) : ref
  if (sha === null || sha.length === 0) throw new GhostUsageError(`${ref} does not exist`)
  const tree = await getCommitTree(repo, sha)
  if (tree === null) return []
  return nameStatus(repo, repo.head, tree)
}
