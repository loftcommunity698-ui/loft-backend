import app from "./app"
import env from "./config/env"
import { createLogger } from "./lib/logger"
import { ensureSearchIndex } from "./services/search"

const log = createLogger("server")

const server = app.listen(env.port, () => {
  log.info(`Loft API running on port ${env.port}`)
  ensureSearchIndex().catch((err) => log.error("Failed to ensure search index", err))
})

const shutdown = () => {
  log.info("Shutting down gracefully...")
  server.close(() => {
    log.info("Server closed")
    process.exit(0)
  })
  setTimeout(() => {
    log.error("Forced shutdown after timeout")
    process.exit(1)
  }, 10000)
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
