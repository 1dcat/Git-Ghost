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

export const startServer = (config: GhostConfig): Promise<void> =>
  new Promise((resolve, reject) => {
    const server = createServer(async (request, response) => {
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
