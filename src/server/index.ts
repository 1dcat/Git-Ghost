/**
 * Scope A — loopback server for the local dashboard.
 */

import { createServer, type IncomingMessage } from "node:http"

import type { GhostConfig } from "../core/config.js"
import { dispatch } from "./routes.js"

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString("utf8")
}

const allowedHosts = (config: GhostConfig): Set<string> => {
  const bare = config.guiHost.includes(":") && !config.guiHost.startsWith("[")
    ? `[${config.guiHost}]`
    : config.guiHost
  return new Set(
    [bare, "127.0.0.1", "localhost", "[::1]"].map((name) => `${name}:${config.guiPort}`.toLowerCase()),
  )
}

// Loopback is not a boundary for a browser. Any page can post to 127.0.0.1,
// and a rebound DNS name can read from it, so only the dashboard's own
// origin may call the API that runs commands.
const rejection = (request: IncomingMessage, hosts: Set<string>): string | null => {
  if (!hosts.has((request.headers.host ?? "").toLowerCase())) return "unexpected Host header"

  const origin = request.headers.origin
  if (origin !== undefined) {
    let originHost: string
    try {
      originHost = new URL(origin).host.toLowerCase()
    } catch {
      return "cross-origin requests are not allowed"
    }
    if (!hosts.has(originHost)) return "cross-origin requests are not allowed"
  }

  const method = request.method ?? "GET"
  if (method !== "GET" && method !== "HEAD") {
    const type = (request.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase()
    if (type !== "application/json") return "requests must send content-type application/json"
  }

  return null
}

export const startServer = (config: GhostConfig): Promise<void> =>
  new Promise((resolve, reject) => {
    const hosts = allowedHosts(config)
    const server = createServer(async (request, response) => {
      const refused = rejection(request, hosts)
      if (refused !== null) {
        response.writeHead(403, { "content-type": "application/json" })
        response.end(JSON.stringify({ error: refused }))
        return
      }

      try {
        const url = new URL(request.url ?? "/", `http://${config.guiHost}:${config.guiPort}`)
        const result = await dispatch(
          request.method ?? "GET",
          url.pathname,
          await readBody(request),
          url.searchParams,
        )
        response.writeHead(result.status, { "content-type": result.contentType })
        response.end(result.body)
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "request failed"
        response.writeHead(500, { "content-type": "application/json" })
        response.end(JSON.stringify({ error: message }))
      }
    })

    server.once("error", reject)
    server.listen(config.guiPort, config.guiHost, () => {
      resolve()
    })
  })
