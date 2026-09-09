import { createLogger } from "../lib/logger"

const log = createLogger("keepalive-oneshot")

async function main(): Promise<void> {
  const url = process.env.PING_URL || process.env.KEEPALIVE_URL
  if (!url) {
    log.error("PING_URL (or KEEPALIVE_URL) is not set")
    process.exit(1)
  }

  const started = Date.now()
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "loft-keepalive-cron", Accept: "application/json" },
      redirect: "follow",
    })
    const ms = Date.now() - started
    if (!res.ok) {
      log.error(`Health check failed [${res.status}] in ${ms}ms`, undefined, { url })
      process.exit(1)
    }
    log.info(`Health check ok [${res.status}] in ${ms}ms`)
    process.exit(0)
  } catch (err) {
    log.error("Health check errored", err as Error, { url })
    process.exit(1)
  }
}

main()