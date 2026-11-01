/**
 * Scope A — `git ghost ask <file>:<line> [question]`.
 */

import { GhostUsageError } from "../../foundation/errors.js"
import { openRepo } from "../../foundation/repo.js"
import { ask, type GhostAnswer } from "../../ask/ask.js"

const USAGE = "usage: git ghost ask <file>:<line> [question]"

const field = (label: string): string => label.padEnd(9, " ")

const firstName = (authorName: string): string => {
  const token = authorName.trim().split(/\s+/)[0]?.replace(/,+$/, "")
  if (token === undefined || token.length === 0) return "Author"
  return token
}

export const formatTranscript = (answer: GhostAnswer): string => {
  const short = answer.commit.slice(0, 7)
  return [
    `ghost · ${answer.file}:${answer.line}`,
    `${field("author")}${answer.authorName}  <${answer.authorEmail}>`,
    `${field("commit")}${short}   ${answer.summary}`,
    `${field("when")}${answer.authoredAt}`,
    "",
    `${firstName(answer.authorName)}:`,
    answer.answer.trim(),
  ].join("\n")
}

export const runAsk = async (args: string[]): Promise<void> => {
  const [rawTarget, ...rest] = args
  if (rawTarget === undefined || rawTarget === "--help" || rawTarget === "-h") {
    if (rawTarget === "--help" || rawTarget === "-h") {
      process.stdout.write(`${USAGE}\n`)
      return
    }
    throw new GhostUsageError(USAGE)
  }

  const question = rest.join(" ").trim()
  const repo = await openRepo()
  const answer = await ask(repo, rawTarget, question.length === 0 ? undefined : question)
  process.stdout.write(`${formatTranscript(answer)}\n`)
}
