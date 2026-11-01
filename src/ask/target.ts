/**
 * Scope A — parse `<file>:<line>` and reject paths ask cannot read.
 */

import { open, readFile, realpath, stat } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"

import { GhostUsageError } from "../foundation/errors.js"
import type { RepoContext } from "../foundation/repo.js"

export type AskTarget = {
  file: string
  line: number
}

const escapesRoot = (root: string, candidate: string): boolean => {
  const rel = relative(root, candidate)
  return rel.length === 0 || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)
}

export const splitLines = (text: string): string[] => {
  if (text.length === 0) return []
  const lines = text.split(/\r?\n/)
  if (text.endsWith("\n")) lines.pop()
  return lines
}

const readSample = async (absolutePath: string): Promise<Buffer> => {
  const handle = await open(absolutePath, "r")
  try {
    const buffer = Buffer.alloc(8192)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

export const parseTarget = async (raw: string, repo: RepoContext): Promise<AskTarget> => {
  const match = /^(.*):(\d+)$/.exec(raw.trim())
  if (!match) {
    throw new GhostUsageError("usage: git ghost ask <file>:<line> [question]")
  }

  const rawFile = match[1] ?? ""
  const line = Number(match[2])
  if (rawFile.length === 0 || line < 1) {
    throw new GhostUsageError("usage: git ghost ask <file>:<line> [question]")
  }

  const absolute = resolve(repo.toplevel, rawFile)
  if (escapesRoot(repo.toplevel, absolute)) {
    throw new GhostUsageError("file must stay inside the repository")
  }

  const file = relative(repo.toplevel, absolute).split(sep).join("/")
  let info
  try {
    info = await stat(absolute)
  } catch (caught) {
    const code = typeof caught === "object" && caught !== null && "code" in caught
      ? String(caught.code)
      : ""
    if (code === "ENOENT") {
      throw new GhostUsageError(`${file} does not exist in the worktree`)
    }
    throw new GhostUsageError(`${file} could not be read`)
  }

  if (!info.isFile()) {
    throw new GhostUsageError(`${file} is not a file`)
  }

  const root = await realpath(repo.toplevel)
  const canonical = await realpath(absolute)
  if (escapesRoot(root, canonical)) {
    throw new GhostUsageError("file must stay inside the repository")
  }

  const sample = await readSample(absolute)
  if (sample.includes(0)) {
    throw new GhostUsageError(`${file} is a binary file`)
  }

  const lines = splitLines(await readFile(absolute, "utf8"))
  if (line > lines.length) {
    throw new GhostUsageError(`${file} has ${lines.length} lines`)
  }

  return { file, line }
}
