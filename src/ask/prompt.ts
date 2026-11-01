/**
 * Scope A — persona, diff, window, and question assembled for the model.
 */

import type { Persona } from "./persona.js"

export type PromptInput = {
  persona: Persona
  file: string
  line: number
  lineText: string
  question?: string
  excerpt: string
  window: string
  ancestry: string | null
}

export type AskPrompt = {
  system: string
  user: string
}

const QUESTION_LIMIT = 8000

export const buildPrompt = (input: PromptInput): AskPrompt => {
  const asked = input.question?.trim() ?? ""
  const question = asked.length === 0
    ? "Explain what this line does and the constraint this commit was protecting."
    : asked.slice(0, QUESTION_LIMIT)
  const parts = [
    `File: ${input.file}`,
    `Line: ${input.line}`,
    `Current line: ${input.lineText}`,
    "",
    `Question: ${question}`,
    "",
    "Local window (`>` marks the asked line):",
    input.window,
    "",
    "Commit diff:",
    input.excerpt,
  ]
  if (input.ancestry !== null && input.ancestry.length > 0) {
    parts.push("", "Previous location, one hop:", input.ancestry)
  }

  return {
    system: input.persona.system,
    user: parts.join("\n"),
  }
}
