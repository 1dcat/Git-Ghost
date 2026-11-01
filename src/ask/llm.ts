/**
 * Scope A — send the ask prompt to OpenAI or Anthropic with fetch.
 */

import type { AskCredentials } from "../foundation/config.js"
import { GhostFailureError } from "../foundation/errors.js"
import type { AskPrompt } from "./prompt.js"

const OPENAI_URL = "https://api.openai.com/v1/chat/completions"
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const readOpenAIText = (payload: unknown): string => {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return ""
  const choice = payload.choices[0]
  if (!isRecord(choice) || !isRecord(choice.message)) return ""
  const content = choice.message.content
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  const texts: string[] = []
  for (const part of content) {
    if (isRecord(part) && typeof part.text === "string") texts.push(part.text)
  }
  return texts.join("")
}

const readAnthropicText = (payload: unknown): string => {
  if (!isRecord(payload) || !Array.isArray(payload.content)) return ""
  const texts: string[] = []
  for (const part of payload.content) {
    if (isRecord(part) && part.type === "text" && typeof part.text === "string") {
      texts.push(part.text)
    }
  }
  return texts.join("")
}

const failureDetail = async (response: Response, apiKey: string): Promise<string> => {
  const body = await response.text()
  const redacted = body.replaceAll(apiKey, "redacted").trim().slice(0, 300)
  if (redacted.length === 0) return `the model request failed (${response.status})`
  return `the model request failed (${response.status}): ${redacted}`
}

const postJson = async (
  url: string,
  headers: Record<string, string>,
  body: unknown,
  fetchImpl: typeof fetch,
  apiKey: string,
): Promise<unknown> => {
  let response: Response
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    })
  } catch (caught) {
    throw new GhostFailureError("the model request failed", { cause: caught })
  }

  if (!response.ok) {
    throw new GhostFailureError(await failureDetail(response, apiKey))
  }

  try {
    return await response.json() as unknown
  } catch (caught) {
    throw new GhostFailureError("the model returned an unreadable response", { cause: caught })
  }
}

export const completePrompt = async (
  credentials: AskCredentials,
  prompt: AskPrompt,
  fetchImpl: typeof fetch = fetch,
): Promise<string> => {
  if (credentials.provider === "openai") {
    const payload = await postJson(
      OPENAI_URL,
      {
        authorization: `Bearer ${credentials.apiKey}`,
        "content-type": "application/json",
      },
      {
        model: credentials.model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      },
      fetchImpl,
      credentials.apiKey,
    )
    const text = readOpenAIText(payload).trim()
    if (text.length === 0) {
      throw new GhostFailureError("the model returned an empty answer")
    }
    return text
  }

  const payload = await postJson(
    ANTHROPIC_URL,
    {
      "x-api-key": credentials.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    {
      model: credentials.model,
      max_tokens: 1024,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    },
    fetchImpl,
    credentials.apiKey,
  )
  const text = readAnthropicText(payload).trim()
  if (text.length === 0) {
    throw new GhostFailureError("the model returned an empty answer")
  }
  return text
}
