/**
 * Scope B — shadow commit lifecycle. The plumbing wrappers live in git-plumbing.ts.
 */

import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { readFile, rm } from "node:fs/promises"
import { join } from "node:path"

import { GhostUsageError } from "./errors.js"
import {
  addAllToIndex,
  commitTree,
  getCommitBody,
  getCommitTree,
  listRefs,
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
      stdio,
      shell: true,
      env: process.env,
    })

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

export const rewind = async (
  _repo: RepoContext,
  _selector?: string,
): Promise<ShadowSnapshot> => {
  throw new GhostUsageError("git ghost rewind is not implemented yet")
}

export const listShadows = async (repo: RepoContext): Promise<Snapshot[]> => {
  const entries = await listRefs(repo, "refs/ghost/snapshots/")
  const filtered = entries.filter((e) => !e.ref.endsWith("/latest"))
  const snapshots: Snapshot[] = []

  for (const { ref, sha } of filtered) {
    const body = await getCommitBody(repo, sha)
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
      createdAt: ref.split("/").pop()?.split("-")[0] ?? "",
    })
  }

  return snapshots
}
