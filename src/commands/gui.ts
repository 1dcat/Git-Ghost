/**
 * Scope A — `git ghost gui`.
 */

import { execFile } from "node:child_process"

import { loadConfig } from "../core/config.js"
import { startServer } from "../server/index.js"
import { log } from "../utils/terminal.js"

const openBrowser = (url: string): void => {
  const command = process.platform === "darwin" ? "open" : "xdg-open"
  execFile(command, [url], () => undefined)
}

export const runGui = async (): Promise<void> => {
  const config = loadConfig()
  await startServer(config)
  const url = `http://${config.guiHost}:${config.guiPort}`
  log(`dashboard  ${url}`)
  openBrowser(url)
}
