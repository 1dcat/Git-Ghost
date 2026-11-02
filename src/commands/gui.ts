/**
 * Scope A — `git ghost gui` opens a local app window.
 */

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { loadConfig } from "../core/config.js"
import { startServer } from "../server/index.js"
import { log } from "../utils/terminal.js"

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../..")

const windowBinary = async (): Promise<string | null> => {
  if (process.platform !== "darwin") return null
  const binary = join(projectRoot, "dist", "ghost-window")
  const source = join(projectRoot, "src", "gui", "mac-window.swift")
  if (!existsSync(source)) return null
  if (existsSync(binary)) return binary
  await mkdir(dirname(binary), { recursive: true })
  const compiled = await new Promise<boolean>((resolve) => {
    const child = spawn("swiftc", ["-O", "-o", binary, source], { stdio: "ignore" })
    child.on("error", () => resolve(false))
    child.on("exit", (code) => resolve(code === 0))
  })
  return compiled ? binary : null
}

const openFallback = (url: string): void => {
  const command = process.platform === "darwin" ? "open" : "xdg-open"
  spawn(command, [url], { stdio: "ignore", detached: true }).unref()
}

const alreadyRunning = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(700) })
    if (!response.ok) return false
    const text = await response.text()
    return text.includes("Git-Ghost")
  } catch {
    return false
  }
}

const openWindow = async (url: string, ownServer: boolean): Promise<void> => {
  const binary = await windowBinary()
  if (binary === null) {
    openFallback(url)
    return
  }
  const window = spawn(binary, [url], { stdio: "ignore", detached: !ownServer })
  window.on("error", () => openFallback(url))
  if (!ownServer) {
    window.unref()
    return
  }
  window.on("exit", () => process.exit(0))
}

const listenErrorCode = (caught: unknown): string => {
  if (typeof caught === "object" && caught !== null && "code" in caught) return String(caught.code)
  return ""
}

export const runGui = async (): Promise<void> => {
  const config = loadConfig()
  const preferred = `http://${config.guiHost}:${config.guiPort}`
  if (await alreadyRunning(preferred)) {
    log(`app  ${preferred}`)
    await openWindow(preferred, false)
    return
  }

  let port = config.guiPort
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await startServer({ ...config, guiPort: port })
      const url = `http://${config.guiHost}:${port}`
      if (port !== config.guiPort) log(`${config.guiPort} is already in use`)
      log(`app  ${url}`)
      await openWindow(url, true)
      return
    } catch (caught) {
      if (listenErrorCode(caught) !== "EADDRINUSE") throw caught
      port += 1
    }
  }

  log(`could not open the app. Ports ${config.guiPort}–${port - 1} are already in use.`)
}
