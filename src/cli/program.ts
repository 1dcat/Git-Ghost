/**
 * Scope A — dispatch `git ghost` to the command that owns it.
 */

import { runAsk } from "./commands/ask.js"
import { GhostUsageError } from "../foundation/errors.js"

const HELP = [
  "git ghost ask <file>:<line> [question]   ask the author of a line",
  "git ghost test [cmd]                     snapshot the tree when cmd passes",
  "git ghost rewind [selector]              restore a shadow snapshot",
  "git ghost gui                            open the local timeline",
  "",
  "selectors: latest (default) | <n> | refs/ghost/shadow/<id> | --list | --undo",
].join("\n")

export const run = async (argv: string[]): Promise<void> => {
  const [command, ...args] = argv
  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write(`${HELP}\n`)
    return
  }
  if (command === "ask") {
    await runAsk(args)
    return
  }
  if (command === "test" || command === "rewind" || command === "gui") {
    throw new GhostUsageError(`git ghost ${command} is not implemented yet`)
  }
  throw new GhostUsageError(`unknown command '${command}'`)
}
