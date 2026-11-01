/**
 * Scope A — one ask() for the CLI and the dashboard.
 */

import { loadConfig, requireAskCredentials, type AskCredentials } from "../foundation/config.js"
import type { RepoContext } from "../foundation/repo.js"
import { parseBlame } from "./blame.js"
import { extractCommitDiff } from "./diff.js"
import { completePrompt } from "./llm.js"
import { buildPersona, shortSha } from "./persona.js"
import { buildPrompt } from "./prompt.js"
import { parseTarget } from "./target.js"

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
