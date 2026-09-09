import { Router, type Request, type Response } from "express"
import { extractToken, verifyToken } from "../lib/jwt"
import { addClient } from "../lib/sse"
import { db } from "../lib/db"
import { rateLimit } from "../lib/rate-limit"
import { createLogger } from "../lib/logger"
import { failure } from "../lib/response"

const router = Router()
const log = createLogger("sse")

router.get("/subscribe", async (req: Request, res: Response) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown"
    const { success: withinLimit } = await rateLimit(`sse:${ip}`, 20, 60000)
    if (!withinLimit) {
      failure(res, "Too many connection attempts", 429)
      return
    }

    const token = extractToken(req)
    if (!token) {
      failure(res, "Unauthorized", 401)
      return
    }

    const jwtUser = verifyToken(token)
    if (!jwtUser) {
      failure(res, "Unauthorized", 401)
      return
    }

    const user = await db.user.findUnique({ where: { clerkId: jwtUser.clerkId } })
    if (!user) {
      failure(res, "User not found", 401)
      return
    }

    const added = addClient(user.clerkId, res)
    if (!added) {
      failure(res, "Too many connections", 429)
      return
    }

    const keepalive = setInterval(() => {
      res.write(":keepalive\n\n")
    }, 30000)

    req.on("close", () => {
      clearInterval(keepalive)
    })
  } catch (err) {
    log.error("SSE subscribe error", err)
    if (!res.headersSent) {
      failure(res, "Internal server error", 500)
    }
  }
})

export default router
