/**
 * Scope A — human-readable CLI output. Errors go to stderr.
 */

const formatted = (message: string): string =>
  message.split("\n").map((line) => `ghost · ${line}`).join("\n")

export const log = (message: string): void => {
  process.stdout.write(`${formatted(message)}\n`)
}

export const error = (message: string): void => {
  process.stderr.write(`${formatted(message)}\n`)
}

export const dim = (message: string): void => {
  const text = `${formatted(message)}\n`
  if (!process.stdout.isTTY) {
    process.stdout.write(text)
    return
  }
  process.stdout.write(`\x1b[2m${text}\x1b[0m`)
}
