import { Router, Response } from "express"
import { db } from "../lib/db"
import { requireAuth } from "../middleware/auth"
import { createLogger } from "../lib/logger"
import type { AuthenticatedRequest } from "../types"
import { failure } from "../lib/response"

const router = Router()
const log = createLogger("interviews")

// PATCH /api/interviews/:id
router.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userEmail = req.user!.email
    const interviewId = parseInt(req.params.id)
    if (isNaN(interviewId)) return failure(res, "Invalid interview ID", 400)

    const interview = await db.interview.findUnique({
      where: { id: interviewId },
      include: { application: { include: { job: true } } },
    })
    if (!interview) return failure(res, "Interview not found", 404)

    const user = await db.user.findUnique({ where: { email: userEmail }, include: { companyMemberships: { take: 1 } } })
    if (!user) return failure(res, "Not authorized", 403)

    const isOwner = interview.application.job.employerId === user.clerkId
    const isCompanyMember = user.companyMemberships.length > 0
    if (!isOwner && !isCompanyMember) return failure(res, "Not authorized", 403)

    const body = req.body
    const { status, notes, feedback, rating, completed, scheduledAt, duration, type, meetingLink, location } = body

    const data: Record<string, any> = {}
    if (status !== undefined) data.status = status
    if (notes !== undefined) data.notes = notes
    if (feedback !== undefined) data.feedback = feedback
    if (rating !== undefined) data.rating = rating
    if (completed !== undefined) data.completed = completed
    if (scheduledAt !== undefined) data.scheduledAt = new Date(scheduledAt)
    if (duration !== undefined) data.duration = duration
    if (type !== undefined) data.type = type
    if (meetingLink !== undefined) data.meetingLink = meetingLink
    if (location !== undefined) data.location = location

    const updated = await db.interview.update({ where: { id: interviewId }, data })
    return res.json({ success: true, interview: updated })
  } catch (error) {
    log.error("Update interview error", error)
    return failure(res, "Internal server error", 500)
  }
})

export default router
