import { Router, Request, Response } from "express"
import { sendEmail } from "../lib/email"
import { rateLimit } from "../lib/rate-limit"

import { createLogger } from "../lib/logger"
import env from "../config/env"
import { failure } from "../lib/response"

const router = Router()
const log = createLogger("contact")

// POST /api/contact - Send contact form
router.post("/", async (req: Request, res: Response) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown"
    const limitResult = await rateLimit(`contact:${ip}`, 5, 60_000)
    if (!limitResult.success) {
      return failure(res, "Too many requests. Please try again later.", 429)
    }

    const { name, email, subject, message } = req.body

    if (!name || !email || !subject || !message) {
      return failure(res, "Name, email, subject, and message are required", 400)
    }

    if (!email.includes("@")) {
      return failure(res, "Invalid email address", 400)
    }

    const result = await sendEmail({
      to: env.supportEmail,
      subject: `[Contact Support] ${subject} - from ${name}`,
      message: `
Contact Support Request

From: ${name}
Email: ${email}
Subject: ${subject}

${message}
      `.trim(),
    })

    if (result.success) {
      return res.json({ success: true, message: "Message sent successfully" })
    }

    return res.status(500).json({
      success: false,
      error: "Failed to send message. Please try emailing us directly.",
      mailtoFallback: `mailto:${env.supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`From: ${name} (${email})\n\n${message}`)}`,
    })
  } catch {
    return failure(res, "Internal server error. Please try emailing us directly.", 500)
  }
})

export default router
