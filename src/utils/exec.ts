/**
 * Scope A — the only Git spawner. Pass GIT_INDEX_FILE through options.env
 * so a temporary index never replaces the developer's index.
 */

import { execFile, type ExecFileException } from "node:child_process"

import { GhostFailureError } from "../core/errors.js"

const MAX_BUFFER_BYTES = 32 * 1024 * 1024

export type GitResult = {
  stdout: string
  stderr: string
  code: number
}

export type GitExecOptions = {
  cwd?: string
  env?: Record<string, string>
}

const mergedEnv = (overrides: Record<string, string>): NodeJS.ProcessEnv => {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  for (const [key, value] of Object.entries(overrides)) {
    env[key] = value
  }
  return env
}

const asText = (value: string | Buffer | null | undefined): string => {
  if (typeof value === "string") return value
  if (value === null || value === undefined) return ""
  return value.toString("utf8")
}

const isSpawnFailure = (error: ExecFileException): boolean =>
  typeof error.code === "string"

const spawnMessage = (error: ExecFileException): string => {
  const detail = error as ExecFileException & { syscall?: string, path?: string }
  if (detail.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return "git output exceeded the capture limit"
  }
  if (detail.code === "ENOENT" && detail.syscall === "chdir") {
    return `cannot run git in ${detail.path ?? "the working directory"}`
  }
  if (detail.code === "ENOENT") return "git was not found on PATH"
  return `git failed to start (${String(detail.code)})`
}

const exitCode = (error: ExecFileException | null): number => {
  if (!error) return 0
  if (typeof error.code === "number") return error.code
  return 1
}

export const runGit = (
  args: string[],
  options?: GitExecOptions,
): Promise<GitResult> =>
  new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd: options?.cwd,
        env: options?.env === undefined ? undefined : mergedEnv(options.env),
        encoding: "utf8",
        maxBuffer: MAX_BUFFER_BYTES,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error && isSpawnFailure(error)) {
          reject(new GhostFailureError(spawnMessage(error), { cause: error }))
          return
        }

        resolve({
          stdout: asText(stdout),
          stderr: asText(stderr),
          code: exitCode(error),
        })
      },
    )
  })
