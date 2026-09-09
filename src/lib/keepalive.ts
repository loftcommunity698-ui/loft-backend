import env from "../config/env"
import { createLogger } from "./logger"

const log = createLogger("keepalive")

async function ping(url: string): Promise<void> {
  const started = Date.now()
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "loft-keepalive", Accept: "application/json" },
    })
    log.info(`Keepalive ping -> ${url} [${res.status}] in ${Date.now() - started}ms`)
  } catch (err) {
    log.error("Keepalive ping failed", err as Error, { url })
  }
}

export function startKeepalive(): void {
  if (!env.keepaliveEnabled) {
    log.info("Keepalive disabled (set KEEPALIVE_ENABLED=true to enable)")
    return
  }
  const url = env.keepaliveUrl
  if (!url) {
    log.warn("Keepalive enabled but KEEPALIVE_URL is not set")
    return
  }

  const intervalMs = env.keepaliveIntervalMin * 60_000

  const timer = setInterval(() => {
    void ping(url)
  }, intervalMs)
  timer.unref()

  const initial = setTimeout(() => void ping(url), 10_000)
  initial.unref()

  log.info(`Keepalive started: pinging ${url} every ${env.keepaliveIntervalMin} minute(s)`)
}