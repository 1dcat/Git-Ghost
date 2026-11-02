/**
 * Load a .env file without overriding variables already set in the shell.
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { openRepo } from "../core/git-plumbing.js"

const applyEnvFile = async (path: string): Promise<void> => {
  let text: string
  try {
    text = await readFile(path, "utf8")
  } catch {
    return
  }

  for (const line of text.split(/\n/)) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    const quoted = (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    if (quoted) value = value.slice(1, -1)
    if (process.env[key] === undefined) process.env[key] = value
  }
}

export const loadProjectEnv = async (): Promise<void> => {
  await applyEnvFile(join(process.cwd(), ".env"))
  try {
    const repo = await openRepo()
    await applyEnvFile(join(repo.toplevel, ".env"))
  } catch {
    // Commands that need a repository report that themselves.
  }
}
