/**
 * Scope A — locate the worktree, GIT_DIR, HEAD, and branch.
 */

import { GhostFailureError } from "./errors.js"
import { runGit, type GitResult } from "./git-exec.js"

export type RepoContext = {
  toplevel: string
  gitDir: string
  head: string | null
  branch: string | null
}

const firstLine = (stdout: string): string => {
  const line = stdout.split("\n")[0] ?? ""
  return line.trim()
}

const failureText = (result: GitResult, fallback: string): string => {
  const stderr = result.stderr.trim()
  if (stderr.length > 0) return stderr
  const stdout = result.stdout.trim()
  if (stdout.length > 0) return stdout
  return fallback
}

export const openRepo = async (cwd?: string): Promise<RepoContext> => {
  const options = cwd === undefined ? undefined : { cwd }

  const toplevelResult = await runGit(["rev-parse", "--show-toplevel"], options)
  if (toplevelResult.code !== 0) {
    throw new GhostFailureError(failureText(toplevelResult, "not a git repository"))
  }

  const toplevel = firstLine(toplevelResult.stdout)
  if (toplevel.length === 0) {
    throw new GhostFailureError("git rev-parse --show-toplevel returned an empty path")
  }

  // `rev-parse --abbrev-ref HEAD` exits 128 on an unborn branch and prints
  // HEAD. symbolic-ref reports the branch name in that case, and fails
  // when HEAD is detached.
  const [gitDirResult, headResult, branchResult] = await Promise.all([
    runGit(["rev-parse", "--absolute-git-dir"], options),
    runGit(["rev-parse", "--verify", "--quiet", "HEAD"], options),
    runGit(["symbolic-ref", "--quiet", "--short", "HEAD"], options),
  ])

  if (gitDirResult.code !== 0) {
    throw new GhostFailureError(failureText(gitDirResult, "cannot resolve GIT_DIR"))
  }

  const gitDir = firstLine(gitDirResult.stdout)
  if (gitDir.length === 0) {
    throw new GhostFailureError("git rev-parse --absolute-git-dir returned an empty path")
  }

  const headSha = firstLine(headResult.stdout)
  const head = headResult.code === 0 && headSha.length > 0 ? headSha : null

  const branchName = branchResult.code === 0 ? firstLine(branchResult.stdout) : ""
  const branch = branchName.length === 0 ? null : branchName

  return { toplevel, gitDir, head, branch }
}
