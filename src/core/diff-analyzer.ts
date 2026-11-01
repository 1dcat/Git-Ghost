/**
 * Scope A — author diff, one ancestry hop, and the worktree window.
 */

import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { loadConfig } from "./config.js"
import { GhostFailureError } from "./errors.js"
import type { RepoContext } from "./git-plumbing.js"
import type { BlamePrevious } from "./blame-parser.js"
import { splitLines } from "./blame-parser.js"
import { runGit } from "../utils/exec.js"

export type CommitDiff = {
  excerpt: string
  window: string
  lineText: string
  ancestry: string | null
}

export type DiffHints = {
  commitFile?: string
  commitLine?: number
  previous?: BlamePrevious | null
  maxDiffBytes?: number
  contextLines?: number
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

const trimToBytes = (text: string, maxBytes: number): string => {
  const buffer = Buffer.from(text, "utf8")
  if (buffer.length <= maxBytes) return text
  const marker = "\n…"
  const budget = Math.max(0, maxBytes - Buffer.byteLength(marker))
  let end = budget
  while (end > 0 && (buffer[end]! & 0xc0) === 0x80) end -= 1
  return `${buffer.subarray(0, end).toString("utf8")}${marker}`
}

const focusDiff = (diff: string, line: number): string => {
  const rows = diff.replace(/\r\n/g, "\n").split("\n")
  let hunkAt = rows.findIndex((row) => HUNK_HEADER.test(row))
  if (hunkAt === -1) hunkAt = rows.length
  const preamble = rows.slice(0, hunkAt).join("\n").trimEnd()
  const hunks: Array<{ text: string, newStart: number, newCount: number }> = []
  let index = hunkAt

  while (index < rows.length) {
    const header = rows[index] ?? ""
    const match = HUNK_HEADER.exec(header)
    if (!match?.[3]) break
    const body = [header]
    index += 1
    while (index < rows.length && !HUNK_HEADER.test(rows[index] ?? "")) {
      body.push(rows[index] ?? "")
      index += 1
    }
    hunks.push({
      text: body.join("\n"),
      newStart: Number(match[3]),
      newCount: match[4] === undefined ? 1 : Number(match[4]),
    })
  }

  if (hunks.length === 0) return preamble

  const covering = hunks.findIndex((hunk) =>
    hunk.newCount > 0
    && line >= hunk.newStart
    && line < hunk.newStart + hunk.newCount,
  )
  const chosen = covering === -1
    ? hunks
    : hunks.slice(Math.max(0, covering - 1), covering + 2)

  return [preamble, ...chosen.map((hunk) => hunk.text)]
    .filter((part) => part.length > 0)
    .join("\n")
}

const showFile = async (
  repo: RepoContext,
  sha: string,
  file: string,
): Promise<string> => {
  const result = await runGit(
    ["--no-pager", "show", "--format=fuller", "--unified=8", sha, "--", file],
    { cwd: repo.toplevel },
  )
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || "git show failed"
    throw new GhostFailureError(detail)
  }
  return result.stdout
}

const readWindow = async (
  repo: RepoContext,
  file: string,
  line: number,
  contextLines: number,
): Promise<{ window: string, lineText: string }> => {
  const text = await readFile(resolve(repo.toplevel, file), "utf8")
  const lines = splitLines(text)
  const start = Math.max(1, line - contextLines)
  const end = Math.min(lines.length, line + contextLines)
  const rendered: string[] = []
  for (let number = start; number <= end; number += 1) {
    const marker = number === line ? ">" : " "
    const source = lines[number - 1] ?? ""
    rendered.push(`${marker} ${String(number).padStart(4, " ")} | ${source}`)
  }
  return {
    window: rendered.join("\n"),
    lineText: lines[line - 1] ?? "",
  }
}

export const extractCommitDiff = async (
  repo: RepoContext,
  sha: string,
  file: string,
  line: number,
  hints?: DiffHints,
): Promise<CommitDiff> => {
  const configured = hints?.maxDiffBytes === undefined || hints.contextLines === undefined
    ? loadConfig()
    : null
  const maxDiffBytes = hints?.maxDiffBytes ?? configured?.maxDiffBytes ?? 24000
  const contextLines = hints?.contextLines ?? configured?.blameContextLines ?? 12
  const commitFile = hints?.commitFile ?? file
  const commitLine = hints?.commitLine ?? line
  const shown = await showFile(repo, sha, commitFile)

  const previous = hints?.previous ?? null
  let ancestry: string | null = null
  if (previous && !/^0+$/.test(previous.commit) && previous.file.length > 0) {
    try {
      const earlier = await showFile(repo, previous.commit, previous.file)
      if (earlier.trim().length > 0) {
        ancestry = trimToBytes(earlier.trimEnd(), Math.max(1, Math.floor(maxDiffBytes / 3)))
      }
    } catch {
      ancestry = null
    }
  }

  const ancestryBytes = ancestry === null ? 0 : Buffer.byteLength(ancestry, "utf8")
  const excerpt = trimToBytes(focusDiff(shown, commitLine).trimEnd(), Math.max(1, maxDiffBytes - ancestryBytes))
  const local = await readWindow(repo, file, line, contextLines)

  return {
    excerpt,
    window: trimToBytes(local.window, maxDiffBytes),
    lineText: local.lineText,
    ancestry,
  }
}
