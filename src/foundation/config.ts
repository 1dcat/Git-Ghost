/**
 * Scope A — environment contract for ask, shadow refs, and the dashboard.
 */

import { GhostUsageError } from "./errors.js"

export type LlmProvider = "openai" | "anthropic"

export type GhostConfig = {
  readonly llmProvider: LlmProvider | null
  readonly openaiApiKey: string | null
  readonly openaiModel: string | null
  readonly anthropicApiKey: string | null
  readonly anthropicModel: string | null
  readonly refNamespace: string
  readonly blameContextLines: number
  readonly maxDiffBytes: number
  readonly guiHost: string
  readonly guiPort: number
}

export type AskCredentials = {
  readonly provider: LlmProvider
  readonly apiKey: string
  readonly model: string
}

const DEFAULT_REF_NAMESPACE = "refs/ghost"
const DEFAULT_BLAME_CONTEXT_LINES = 12
const DEFAULT_MAX_DIFF_BYTES = 24000
const DEFAULT_GUI_HOST = "127.0.0.1"
const DEFAULT_GUI_PORT = 4737

const REF_NAMESPACE_PATTERN = /^refs\/[A-Za-z0-9._/-]+$/

const readString = (env: NodeJS.ProcessEnv, key: string): string | null => {
  const raw = env[key]
  if (raw === undefined) return null
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  return trimmed
}

const readProvider = (env: NodeJS.ProcessEnv): LlmProvider | null => {
  const raw = readString(env, "GHOST_LLM_PROVIDER")
  if (raw === null) return null
  const provider = raw.toLowerCase()
  if (provider === "openai" || provider === "anthropic") return provider
  throw new GhostUsageError("GHOST_LLM_PROVIDER must be openai or anthropic")
}

const readInteger = (
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
): number => {
  const raw = readString(env, key)
  if (raw === null) return fallback
  if (!/^\d+$/.test(raw)) {
    throw new GhostUsageError(`${key} must be a non-negative integer`)
  }
  const value = Number(raw)
  if (!Number.isSafeInteger(value)) {
    throw new GhostUsageError(`${key} is out of range`)
  }
  return value
}

const readRefNamespace = (env: NodeJS.ProcessEnv): string => {
  const raw = readString(env, "GHOST_REF_NAMESPACE") ?? DEFAULT_REF_NAMESPACE
  const namespace = raw.replace(/\/+$/, "")
  const malformed = !REF_NAMESPACE_PATTERN.test(namespace)
    || namespace.includes("..")
    || namespace.includes("//")
  if (malformed) {
    throw new GhostUsageError("GHOST_REF_NAMESPACE must be a ref prefix under refs/")
  }
  return namespace
}

const readHost = (env: NodeJS.ProcessEnv): string => {
  const host = readString(env, "GHOST_GUI_HOST") ?? DEFAULT_GUI_HOST
  if (/\s/.test(host)) {
    throw new GhostUsageError("GHOST_GUI_HOST must not contain whitespace")
  }
  return host
}

const readPort = (env: NodeJS.ProcessEnv): number => {
  const port = readInteger(env, "GHOST_GUI_PORT", DEFAULT_GUI_PORT)
  if (port < 1 || port > 65535) {
    throw new GhostUsageError("GHOST_GUI_PORT must be between 1 and 65535")
  }
  return port
}

const readBlameContextLines = (env: NodeJS.ProcessEnv): number =>
  readInteger(env, "GHOST_BLAME_CONTEXT_LINES", DEFAULT_BLAME_CONTEXT_LINES)

const readMaxDiffBytes = (env: NodeJS.ProcessEnv): number => {
  const bytes = readInteger(env, "GHOST_MAX_DIFF_BYTES", DEFAULT_MAX_DIFF_BYTES)
  if (bytes < 1) {
    throw new GhostUsageError("GHOST_MAX_DIFF_BYTES must be at least 1")
  }
  return bytes
}

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): GhostConfig => ({
  llmProvider: readProvider(env),
  openaiApiKey: readString(env, "OPENAI_API_KEY"),
  openaiModel: readString(env, "OPENAI_MODEL"),
  anthropicApiKey: readString(env, "ANTHROPIC_API_KEY"),
  anthropicModel: readString(env, "ANTHROPIC_MODEL"),
  refNamespace: readRefNamespace(env),
  blameContextLines: readBlameContextLines(env),
  maxDiffBytes: readMaxDiffBytes(env),
  guiHost: readHost(env),
  guiPort: readPort(env),
})

/** Ask calls this. Other commands can load config without a provider key. */
export const requireAskCredentials = (config: GhostConfig): AskCredentials => {
  if (config.llmProvider === null) {
    throw new GhostUsageError("Set GHOST_LLM_PROVIDER to openai or anthropic")
  }

  if (config.llmProvider === "openai") {
    if (config.openaiApiKey === null) {
      throw new GhostUsageError("OPENAI_API_KEY is required when GHOST_LLM_PROVIDER is openai")
    }
    if (config.openaiModel === null) {
      throw new GhostUsageError("OPENAI_MODEL is required when GHOST_LLM_PROVIDER is openai")
    }
    return {
      provider: "openai",
      apiKey: config.openaiApiKey,
      model: config.openaiModel,
    }
  }

  if (config.anthropicApiKey === null) {
    throw new GhostUsageError("ANTHROPIC_API_KEY is required when GHOST_LLM_PROVIDER is anthropic")
  }
  if (config.anthropicModel === null) {
    throw new GhostUsageError("ANTHROPIC_MODEL is required when GHOST_LLM_PROVIDER is anthropic")
  }
  return {
    provider: "anthropic",
    apiKey: config.anthropicApiKey,
    model: config.anthropicModel,
  }
}
