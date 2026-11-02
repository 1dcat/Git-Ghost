/**
 * Scope A — write a local .env and check that Ollama can answer.
 */

import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { openRepo } from "../core/git-plumbing.js"
import { runGit } from "../utils/exec.js"
import { log } from "../utils/terminal.js"

const DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1"

type OllamaTags = {
  models?: Array<{ name?: string }>
}

const preferModel = (names: string[]): string | null => {
  const coder = names.find((name) => name.includes("coder"))
  if (coder) return coder
  const llama = names.find((name) => name.startsWith("llama"))
  return llama ?? names[0] ?? null
}

const readOllamaModels = async (): Promise<string[] | null> => {
  try {
    const response = await fetch("http://127.0.0.1:11434/api/tags")
    if (!response.ok) return null
    const data = await response.json() as OllamaTags
    return (data.models ?? [])
      .map((model) => model.name ?? "")
      .filter((name) => name.length > 0)
  } catch {
    return null
  }
}

const upsert = (text: string, key: string, value: string): string => {
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${key}=.*$`, "m")
  if (pattern.test(text)) return text.replace(pattern, line)
  const base = text.trimEnd()
  return `${base.length > 0 ? `${base}\n` : ""}${line}\n`
}

const targetEnvPath = async (): Promise<string> => {
  try {
    const repo = await openRepo()
    return join(repo.toplevel, ".env")
  } catch {
    return join(process.cwd(), ".env")
  }
}

const gitIdentity = async (): Promise<string | null> => {
  const name = await runGit(["config", "user.name"])
  const email = await runGit(["config", "user.email"])
  if (name.code !== 0 || email.code !== 0) return null
  const who = `${name.stdout.trim()} <${email.stdout.trim()}>`
  return who.includes("<>") ? null : who
}

export const runSetup = async (): Promise<void> => {
  const models = await readOllamaModels()
  if (models === null) {
    log("Ollama is not running. Start it with: ollama serve")
    log("Then run git ghost setup again.")
    return
  }
  if (models.length === 0) {
    log("Ollama has no models yet. Pull one, then run setup again:")
    log("ollama pull qwen2.5-coder:7b")
    return
  }

  const model = preferModel(models)
  if (model === null) return

  const envPath = await targetEnvPath()
  let text = ""
  try {
    text = await readFile(envPath, "utf8")
  } catch {
    text = ""
  }
  text = upsert(text, "GHOST_LLM_PROVIDER", "local")
  text = upsert(text, "GHOST_LOCAL_BASE_URL", DEFAULT_BASE_URL)
  text = upsert(text, "GHOST_LOCAL_MODEL", model)
  await writeFile(envPath, text.endsWith("\n") ? text : `${text}\n`)

  log("provider  local")
  log(`model     ${model}`)
  log(`server    ${DEFAULT_BASE_URL}`)
  log(`wrote     ${envPath}`)

  const identity = await gitIdentity()
  if (identity === null) {
    log("git still needs user.name and user.email before shadow commits")
  } else {
    log(`git       ${identity}`)
  }

  log("ask with  git ghost ask <file>:<line> \"why is this here?\"")
  log("test and rewind do not use a model")
}
