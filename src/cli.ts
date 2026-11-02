#!/usr/bin/env node
/**
 * Scope A — register ask, test, rewind, and gui.
 */

import { Command, CommanderError } from "commander"

import { runAsk } from "./commands/ask.js"
import { runGui } from "./commands/gui.js"
import { runRewind } from "./commands/rewind.js"
import { runTest } from "./commands/test.js"
import { ExitCode, GhostError } from "./core/errors.js"
import { error } from "./utils/terminal.js"

const program = new Command()

program
  .name("git-ghost")
  .description("Talk to the commit that wrote the line.")
  .exitOverride()

program
  .command("ask")
  .description("ask the author of a line")
  .argument("<target>", "file:line")
  .argument("[question...]", "question for that author")
  .action(async (target: string, question: string[]) => {
    await runAsk([target, ...question])
  })

program
  .command("test")
  .description("snapshot the tree when the command passes")
  .argument("[cmd...]", "command to run")
  .action(async (cmd: string[]) => {
    await runTest(cmd)
  })

program
  .command("rewind")
  .description("restore a shadow snapshot")
  .argument("[selector]", "latest, a hop count, or a ref")
  .option("--list", "list snapshots without changing the worktree")
  .option("--undo", "return to the newest backup")
  .action(async (selector: string | undefined, options: { list?: boolean, undo?: boolean }) => {
    const args: string[] = []
    if (options.list) args.push("--list")
    if (options.undo) args.push("--undo")
    if (selector !== undefined) args.push(selector)
    await runRewind(args)
  })

program
  .command("gui")
  .description("open the local timeline")
  .action(async () => {
    await runGui()
  })

const main = async (): Promise<void> => {
  try {
    await program.parseAsync(process.argv)
  } catch (caught) {
    if (caught instanceof CommanderError) {
      if (caught.exitCode === 0) return
      error(caught.message)
      process.exit(ExitCode.usage)
    }
    const message = caught instanceof Error ? caught.message : "git ghost failed"
    error(message)
    process.exit(caught instanceof GhostError ? caught.exitCode : ExitCode.failure)
  }
}

await main()
