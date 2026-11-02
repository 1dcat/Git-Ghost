/**
 * Scope A — locate the worktree, GIT_DIR, HEAD, and branch.
 */

import { GhostFailureError } from "./errors.js"
import { runGit, type GitResult } from "../utils/exec.js"

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

const gitText = (result: GitResult, fallback: string): string => {
  if (result.code === 0) return firstLine(result.stdout)
  const detail = result.stderr.trim() || result.stdout.trim() || fallback
  throw new GhostFailureError(detail)
}

export const writeTree = async (repo: RepoContext, indexFile?: string): Promise<string> => {
  const result = await runGit(["write-tree"], {
    cwd: repo.toplevel,
    env: indexFile === undefined ? undefined : { GIT_INDEX_FILE: indexFile },
  })
  return gitText(result, "git write-tree failed")
}

export const commitTree = async (
  repo: RepoContext,
  tree: string,
  message: string,
  parent?: string,
): Promise<string> => {
  const args = ["commit-tree", tree, "-m", message]
  if (parent !== undefined) args.push("-p", parent)
  const result = await runGit(args, { cwd: repo.toplevel })
  return gitText(result, "git commit-tree failed")
}

export const updateRef = async (repo: RepoContext, ref: string, commit: string): Promise<void> => {
  const result = await runGit(["update-ref", ref, commit], { cwd: repo.toplevel })
  gitText(result, "git update-ref failed")
}

export const readTree = async (
  repo: RepoContext,
  treeIsh: string,
  indexFile?: string,
): Promise<void> => {
  const result = await runGit(["read-tree", treeIsh], {
    cwd: repo.toplevel,
    env: indexFile === undefined ? undefined : { GIT_INDEX_FILE: indexFile },
  })
  gitText(result, `git read-tree ${treeIsh} failed`)
}

export const addAllToIndex = async (
  repo: RepoContext,
  indexFile: string,
): Promise<void> => {
  const result = await runGit(["add", "-A"], {
    cwd: repo.toplevel,
    env: { GIT_INDEX_FILE: indexFile },
  })
  gitText(result, "git add -A failed")
}

export const resolveRef = async (
  repo: RepoContext,
  ref: string,
): Promise<string | null> => {
  const result = await runGit(["rev-parse", "--verify", "--quiet", ref], {
    cwd: repo.toplevel,
  })
  if (result.code !== 0) return null
  const sha = firstLine(result.stdout)
  return sha.length > 0 ? sha : null
}

export const getCommitTree = async (
  repo: RepoContext,
  commitIsh: string,
): Promise<string | null> => {
  const result = await runGit(["rev-parse", "--verify", "--quiet", `${commitIsh}^{tree}`], {
    cwd: repo.toplevel,
  })
  if (result.code !== 0) return null
  const sha = firstLine(result.stdout)
  return sha.length > 0 ? sha : null
}

export const listRefs = async (
  repo: RepoContext,
  pattern: string,
): Promise<Array<{ ref: string; sha: string }>> => {
  const result = await runGit(
    ["for-each-ref", "--sort=-creatordate", "--format=%(refname) %(objectname)", pattern],
    { cwd: repo.toplevel },
  )
  if (result.code !== 0) return []
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [ref = "", sha = ""] = line.split(" ")
      return { ref, sha }
    })
    .filter((entry) => entry.ref.length > 0 && entry.sha.length > 0)
}

export const checkoutTree = async (repo: RepoContext, treeIsh: string): Promise<void> => {
  const result = await runGit(
    ["restore", "--source", treeIsh, "--worktree", "--staged", "."],
    { cwd: repo.toplevel },
  )
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || "git restore failed"
    throw new GhostFailureError(detail)
  }
}

export const getCommitParent = async (
  repo: RepoContext,
  commit: string,
): Promise<string | null> => {
  const result = await runGit(["rev-parse", "--verify", "--quiet", `${commit}^`], {
    cwd: repo.toplevel,
  })
  if (result.code !== 0) return null
  const sha = firstLine(result.stdout)
  return sha.length > 0 ? sha : null
}

export const nameStatus = async (
  repo: RepoContext,
  from: string | null,
  to: string,
): Promise<Array<{ status: string, path: string }>> => {
  const args = from
    ? ["diff", "--name-status", from, to]
    : ["diff-tree", "--name-status", "--root", "-r", to]
  const result = await runGit(args, { cwd: repo.toplevel })
  if (result.code !== 0) return []
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [status = "", ...rest] = line.split("\t")
      return { status: status.slice(0, 1), path: rest[rest.length - 1] ?? "" }
    })
    .filter((file) => file.path.length > 0)
}

export const getCommitDate = async (repo: RepoContext, commitSha: string): Promise<string> => {
  const result = await runGit(["log", "-1", "--format=%cI", commitSha], {
    cwd: repo.toplevel,
  })
  if (result.code !== 0) return ""
  return result.stdout.trim()
}

export const getCommitBody = async (
  repo: RepoContext,
  commitSha: string,
): Promise<string> => {
  const result = await runGit(["log", "-1", "--format=%B", commitSha], {
    cwd: repo.toplevel,
  })
  if (result.code !== 0) return ""
  return result.stdout
}

