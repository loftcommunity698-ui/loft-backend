import { Router, Response } from "express"
import { db } from "../lib/db"
import { requireAuth } from "../middleware/auth"
import { sendEmail, emailTemplates, shouldSendEmail } from "../lib/email"
import { createLogger } from "../lib/logger"
import { sendEvent } from "../lib/sse"
import { rateLimit } from "../lib/rate-limit"
import type { AuthenticatedRequest } from "../types"
import { failure } from "../lib/response"

const router = Router()
const log = createLogger("messages")

// GET /api/messages - List conversations
router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userEmail = req.user!.email
    const jobId = req.query.jobId as string

    const user = await db.user.findUnique({ where: { email: userEmail } })
    if (!user) return failure(res, "User not found", 404)

    const whereClause: any = { OR: [{ senderId: user.clerkId }, { receiverId: user.clerkId }] }
    if (jobId) whereClause.jobId = jobId

    const messages = await db.message.findMany({
      where: whereClause,
      orderBy: { createdAt: "asc" },
      include: { sender: { select: { id: true, clerkId: true, name: true, firstName: true, lastName: true, profileImage: true } }, receiver: { select: { id: true, clerkId: true, name: true, firstName: true, lastName: true, profileImage: true } } },
    })

    return res.json(messages.map(msg => ({
      id: msg.id, content: msg.content, jobId: msg.jobId, readAt: msg.readAt,
      createdAt: msg.createdAt, isOwn: msg.senderId === user.clerkId,
      sender: msg.sender, receiver: msg.receiver,
    })))
  } catch (error) {
    log.error("List messages error", error)
    return failure(res, "Internal server error", 500)
  }
})

// POST /api/messages - Send message
router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userEmail = req.user!.email
    const user = await db.user.findUnique({ where: { email: userEmail } })
    if (!user) return failure(res, "User not found", 404)

    const { receiverId, content: rawContent, jobId } = req.body
    const content = (rawContent || "").trim().slice(0, 5000)
    if (!receiverId || !content) return failure(res, "Missing required fields", 400)
    if (receiverId === user.clerkId) return failure(res, "Cannot message yourself", 400)

    const ip = req.ip || req.socket.remoteAddress || "unknown"
    const { success: withinLimit } = await rateLimit(`msg:${user.clerkId}:${ip}`, 30, 60000)
    if (!withinLimit) return failure(res, "Too many messages. Please slow down.", 429)

    // Verify candidate is at INTERVIEW stage if jobId provided
    if (jobId) {
      const application = await db.jobApplication.findFirst({ where: { jobId, userId: receiverId } })
      if (!application) return failure(res, "Application not found", 404)
      if (application.status !== "INTERVIEW" && application.status !== "OFFERED") {
        return failure(res, "Messaging only available when candidate is at Interview stage", 403)
      }
    }

    const message = await db.message.create({
      data: { senderId: user.clerkId, receiverId, content, jobId: jobId || null },
    })

    const senderName = user.firstName || user.name || "Employer"
    const receiver = await db.user.findUnique({ where: { clerkId: receiverId } })

    await db.notification.create({
      data: { userId: receiverId, title: "New Message", message: `You have a new message from ${senderName}`, type: "MESSAGE", link: "/dashboard/messages" },
    })

    if (receiver?.email) {
      const shouldNotify = await shouldSendEmail(receiverId, "newMessages")
      if (shouldNotify) await sendEmail(emailTemplates.newMessage(senderName, receiver.email))
    }

    const messagePayload = {
      id: message.id, content: message.content, senderId: user.clerkId,
      receiverId, jobId: jobId || null,
      createdAt: message.createdAt,
      sender: { id: user.id, firstName: user.firstName, lastName: user.lastName, profileImage: user.profileImage },
      receiver: receiver ? { id: receiver.id, firstName: receiver.firstName, lastName: receiver.lastName, profileImage: receiver.profileImage } : null,
    }

    sendEvent(receiverId, "new_message", messagePayload)
    sendEvent(user.clerkId, "new_message", messagePayload)

    return res.json({ success: true, message: { id: message.id, content: message.content, createdAt: message.createdAt } })
  } catch (error) {
    log.error("Send message error", error)
    return failure(res, "Internal server error", 500)
  }
})

// POST /api/messages/:id/read - Mark message as read
router.post("/:id/read", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userEmail = req.user!.email
    const messageId = parseInt(req.params.id)
    if (isNaN(messageId)) return failure(res, "Invalid message ID", 400)

    const user = await db.user.findUnique({ where: { email: userEmail } })
    if (!user) return failure(res, "User not found", 404)

    const message = await db.message.findUnique({ where: { id: messageId } })
    if (!message) return failure(res, "Message not found", 404)
    if (message.receiverId !== user.clerkId) return failure(res, "Not authorized", 403)

    await db.message.update({ where: { id: messageId }, data: { readAt: new Date() } })
    return res.json({ success: true })
  } catch (error) {
    log.error("Mark message read error", error)
    return failure(res, "Internal server error", 500)
  }
})

export default router
