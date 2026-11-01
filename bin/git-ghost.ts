/**
 * Scope A — Git finds this process as the `ghost` subcommand.
 */

import { ExitCode, GhostError } from "../src/foundation/errors.js"
import { error } from "../src/foundation/logger.js"
import { run } from "../src/cli/program.js"

const main = async (): Promise<void> => {
  try {
    await run(process.argv.slice(2))
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "git ghost failed"
    error(message)
    process.exit(caught instanceof GhostError ? caught.exitCode : ExitCode.failure)
  }
}

await main()
