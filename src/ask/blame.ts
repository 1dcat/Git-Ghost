/**
 * Scope A — porcelain blame for one worktree line.
 */

import { GhostFailureError } from "../foundation/errors.js"
import { runGit } from "../foundation/git-exec.js"
import type { RepoContext } from "../foundation/repo.js"

export type BlamePrevious = {
  commit: string
  file: string
}

export type BlameChunk = {
  commit: string
  authorName: string
  authorEmail: string
  authorTime: number
  authorTz: string
  summary: string
  previous: BlamePrevious | null
  filename: string
  origLine: number
  finalLine: number
  lineText: string
}

const stripMail = (raw: string): string => raw.trim().replace(/^<|>$/g, "")

const parsePorcelain = (
  porcelain: string,
  file: string,
  line: number,
): BlameChunk => {
  const rows = porcelain.replace(/\r\n/g, "\n").split("\n")
  const header = /^([0-9a-fA-F]+) (\d+) (\d+) (\d+)$/.exec(rows[0] ?? "")
  if (!header?.[1]) {
    throw new GhostFailureError("git blame returned an unreadable porcelain header")
  }

  const commit = header[1]
  const origLine = Number(header[2])
  const finalLine = Number(header[3])
  let authorName: string | null = null
  let authorEmail: string | null = null
  let authorTime: number | null = null
  let authorTz = "+0000"
  let summary: string | null = null
  let filename = file
  let previous: BlamePrevious | null = null
  let lineText = ""

  for (const row of rows.slice(1)) {
    if (row.startsWith("\t")) {
      lineText = row.slice(1)
      break
    }
    if (row.startsWith("author ")) {
      authorName = row.slice("author ".length)
      continue
    }
    if (row.startsWith("author-mail ")) {
      authorEmail = stripMail(row.slice("author-mail ".length))
      continue
    }
    if (row.startsWith("author-time ")) {
      const parsed = Number(row.slice("author-time ".length))
      authorTime = Number.isInteger(parsed) ? parsed : null
      continue
    }
    if (row.startsWith("author-tz ")) {
      authorTz = row.slice("author-tz ".length).trim()
      continue
    }
    if (row.startsWith("summary ")) {
      summary = row.slice("summary ".length)
      continue
    }
    if (row.startsWith("filename ")) {
      filename = row.slice("filename ".length)
      continue
    }
    if (row.startsWith("previous ")) {
      const rest = row.slice("previous ".length)
      const splitAt = rest.indexOf(" ")
      if (splitAt === -1) {
        previous = { commit: rest, file: filename }
        continue
      }
      previous = {
        commit: rest.slice(0, splitAt),
        file: rest.slice(splitAt + 1),
      }
    }
  }

  if (/^0+$/.test(commit)) {
    throw new GhostFailureError(
      `${file}:${line} has no commit yet. Commit the line before asking who wrote it.`,
    )
  }

  if (
    authorName === null
    || authorName.length === 0
    || authorEmail === null
    || authorEmail.length === 0
    || authorTime === null
    || summary === null
  ) {
    throw new GhostFailureError("git blame returned an incomplete porcelain chunk")
  }

  return {
    commit,
    authorName,
    authorEmail,
    authorTime,
    authorTz,
    summary,
    previous,
    filename,
    origLine,
    finalLine,
    lineText,
  }
}

export const parseBlame = async (
  repo: RepoContext,
  file: string,
  line: number,
): Promise<BlameChunk> => {
  const result = await runGit(
    ["--no-pager", "blame", "-L", `${line},${line}`, "--porcelain", "--", file],
    { cwd: repo.toplevel },
  )
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || "git blame failed"
    throw new GhostFailureError(detail)
  }
  return parsePorcelain(result.stdout, file, line)
}
