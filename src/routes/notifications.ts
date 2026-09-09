import { Router, Response } from "express"
import { db } from "../lib/db"
import { requireAuth } from "../middleware/auth"
import { createLogger } from "../lib/logger"
import type { AuthenticatedRequest } from "../types"
import { failure } from "../lib/response"

const router = Router()
const log = createLogger("notifications")

// GET /api/notifications
router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userEmail = req.user!.email
    const user = await db.user.findUnique({ where: { email: userEmail } })
    if (!user) return failure(res, "User not found", 404)

    const unreadOnly = req.query.unreadOnly === "true"
    const limit = parseInt(req.query.limit as string) || 50
    const where: Record<string, unknown> = { userId: user.clerkId }
    if (unreadOnly) where.isRead = false

    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: limit }),
      db.notification.count({ where: { userId: user.clerkId, isRead: false } }),
    ])

    return res.json({ notifications, unreadCount, total: notifications.length })
  } catch (error) {
    log.error("List notifications error", error)
    return failure(res, "Internal server error", 500)
  }
})

// PATCH /api/notifications - Mark read (bulk)
router.patch("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userEmail = req.user!.email
    const user = await db.user.findUnique({ where: { email: userEmail } })
    if (!user) return failure(res, "User not found", 404)

    const { notificationIds, markAllRead } = req.body

    if (markAllRead) {
      await db.notification.updateMany({
        where: { userId: user.clerkId, isRead: false },
        data: { isRead: true, readAt: new Date() },
      })
      return res.json({ success: true })
    }

    if (notificationIds && Array.isArray(notificationIds)) {
      await db.notification.updateMany({
        where: { id: { in: notificationIds }, userId: user.clerkId },
        data: { isRead: true, readAt: new Date() },
      })
      return res.json({ success: true })
    }

    return failure(res, "Invalid request", 400)
  } catch (error) {
    log.error("Mark notifications read error", error)
    return failure(res, "Internal server error", 500)
  }
})

// POST /api/notifications - Create notification (admin/server-side)
router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, title, message, type, data, link } = req.body
    if (!userId || !title || !message || !type) {
      return failure(res, "Missing required fields", 400)
    }

    const notification = await db.notification.create({ data: { userId, title, message, type, data, link } })
    return res.status(201).json({ success: true, notification })
  } catch (error) {
    log.error("Create notification error", error)
    return failure(res, "Internal server error", 500)
  }
})

// PATCH /api/notifications/:id - Update single notification
router.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userEmail = req.user!.email
    const user = await db.user.findUnique({ where: { email: userEmail } })
    if (!user) return failure(res, "User not found", 404)

    const notificationId = parseInt(req.params.id)
    const notification = await db.notification.findUnique({ where: { id: notificationId } })
    if (!notification) return failure(res, "Notification not found", 404)
    if (notification.userId !== user.clerkId) return failure(res, "Not authorized", 403)

    const { isRead } = req.body
    const updated = await db.notification.update({
      where: { id: notificationId },
      data: { isRead: isRead ?? true, readAt: isRead ? new Date() : null },
    })
    return res.json({ success: true, notification: updated })
  } catch (error) {
    log.error("Update notification error", error)
    return failure(res, "Internal server error", 500)
  }
})

export default router
