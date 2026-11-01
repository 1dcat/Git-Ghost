/**
 * Scope A — dashboard routes over the same ask and shadow functions as the CLI.
 */

import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { ask } from "../commands/ask.js"
import { GhostError } from "../core/errors.js"
import { openRepo } from "../core/git-plumbing.js"
import { listShadows, rewind } from "../core/shadow-manager.js"

export type RouteResult = {
  status: number
  contentType: string
  body: string
}

const webIndex = join(dirname(fileURLToPath(import.meta.url)), "../../web/index.html")

const json = (status: number, value: unknown): RouteResult => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(value),
})

const readJson = (body: string): Record<string, unknown> => {
  if (body.trim().length === 0) return {}
  const parsed: unknown = JSON.parse(body)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {}
  return parsed as Record<string, unknown>
}

export const dispatch = async (method: string, path: string, body: string): Promise<RouteResult> => {
  if (method === "GET" && (path === "/" || path === "/index.html")) {
    return {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: await readFile(webIndex, "utf8"),
    }
  }

  if (method === "GET" && path === "/api/shadows") {
    const repo = await openRepo()
    return json(200, { shadows: await listShadows(repo) })
  }

  if (method === "POST" && path === "/api/rewind") {
    const repo = await openRepo()
    const payload = readJson(body)
    const selector = typeof payload.selector === "string" ? payload.selector : undefined
    try {
      return json(200, { snapshot: await rewind(repo, selector) })
    } catch (caught) {
      const status = caught instanceof GhostError && caught.exitCode === 2 ? 501 : 500
      const message = caught instanceof Error ? caught.message : "rewind failed"
      return json(status, { error: message })
    }
  }

  if (method === "POST" && path === "/api/ask") {
    const repo = await openRepo()
    const payload = readJson(body)
    const target = typeof payload.target === "string" ? payload.target : ""
    const question = typeof payload.question === "string" ? payload.question : undefined
    if (target.length === 0) return json(400, { error: "target is required" })
    const answer = await ask(repo, target, question)
    return json(200, answer)
  }

  return json(404, { error: "not found" })
}
