/**
 * Scope A — `git ghost ask <file>:<line> [question]`.
 */

import { loadConfig, requireAskCredentials, type AskCredentials } from "../core/config.js"
import { GhostUsageError } from "../core/errors.js"
import { openRepo, type RepoContext } from "../core/git-plumbing.js"
import { parseBlame, parseTarget } from "../core/blame-parser.js"
import { extractCommitDiff } from "../core/diff-analyzer.js"
import { completePrompt } from "../ai/client.js"
import { buildPersona, shortSha } from "../ai/persona-builder.js"
import { buildPrompt } from "../ai/prompts.js"

export type GhostAnswer = {
  file: string
  line: number
  authorName: string
  authorEmail: string
  commit: string
  summary: string
  answer: string
  authoredAt: string
}

export type AskOptions = {
  fetch?: typeof fetch
  env?: NodeJS.ProcessEnv
}

const USAGE = "usage: git ghost ask <file>:<line> [question]"

const normalizeAnswer = (text: string, closing: string, brief: string): string => {
  const trailing = new RegExp(`(?:^|\\n+)—\\s+${brief}\\b[^\\n]*$`)
  const body = text.trim().replace(trailing, "").trim()
  if (body.length === 0) return closing
  return `${body}\n\n${closing}`
}

export const ask = async (
  repo: RepoContext,
  target: string,
  question?: string,
  options?: AskOptions,
): Promise<GhostAnswer> => {
  const config = loadConfig(options?.env)
  const parsed = await parseTarget(target, repo)
  const blame = await parseBlame(repo, parsed.file, parsed.line)
  const diff = await extractCommitDiff(repo, blame.commit, parsed.file, parsed.line, {
    commitFile: blame.filename,
    commitLine: blame.origLine,
    previous: blame.previous,
    maxDiffBytes: config.maxDiffBytes,
    contextLines: config.blameContextLines,
  })
  const credentials: AskCredentials = requireAskCredentials(config)
  const persona = buildPersona({
    authorName: blame.authorName,
    authorTime: blame.authorTime,
    authorTz: blame.authorTz,
    commit: blame.commit,
    summary: blame.summary,
  })
  const prompt = buildPrompt({
    persona,
    file: parsed.file,
    line: parsed.line,
    lineText: diff.lineText,
    question,
    excerpt: diff.excerpt,
    window: diff.window,
    ancestry: diff.ancestry,
  })
  const spoken = await completePrompt(credentials, prompt, options?.fetch)
  const answer = normalizeAnswer(spoken, persona.closing, shortSha(blame.commit))

  return {
    file: parsed.file,
    line: parsed.line,
    authorName: blame.authorName,
    authorEmail: blame.authorEmail,
    commit: blame.commit,
    summary: blame.summary,
    answer,
    authoredAt: persona.authoredAt,
  }
}

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
  if (rawTarget === "--help" || rawTarget === "-h") {
    process.stdout.write(`${USAGE}\n`)
    return
  }
  if (rawTarget === undefined) throw new GhostUsageError(USAGE)

  const question = rest.join(" ").trim()
  const repo = await openRepo()
  const answer = await ask(repo, rawTarget, question.length === 0 ? undefined : question)
  process.stdout.write(`${formatTranscript(answer)}\n`)
}
