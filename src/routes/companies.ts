import { Router, Response } from "express"
import { db } from "../lib/db"
import { requireAuth } from "../middleware/auth"
import { createLogger } from "../lib/logger"
import type { AuthenticatedRequest } from "../types"
import { CompanySize } from "@prisma/client"
import { failure } from "../lib/response"

const router = Router()
const log = createLogger("companies")

// GET /api/companies/profile
router.get("/profile", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userEmail = req.user!.email
    const user = await db.user.findUnique({ where: { email: userEmail }, include: { employerProfile: true } })
    return res.json(user?.employerProfile || null)
  } catch (error) {
    log.error("Get company profile error", error)
    return failure(res, "Internal server error", 500)
  }
})

// PATCH /api/companies/profile
router.patch("/profile", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userEmail = req.user!.email
    const user = await db.user.findUnique({ where: { email: userEmail } })
    if (!user) return failure(res, "User not found", 404)

    const { companyName, industry, size, description, website, city, country } = req.body
    if (!companyName || !industry || !size) return failure(res, "Missing required fields", 400)

    const profile = await db.employerProfile.upsert({
      where: { userId: user.clerkId },
      update: { companyName, industry, companySize: size as CompanySize, description, companyWebsite: website, city, country },
      create: { userId: user.clerkId, companyName, industry, companySize: size as CompanySize, description, companyWebsite: website, city, country, contactEmail: user.email },
    })
    return res.json({ success: true, profile })
  } catch (error) {
    log.error("Update company profile error", error)
    return failure(res, "Internal server error", 500)
  }
})

// GET /api/companies/jobs
router.get("/jobs", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userEmail = req.user!.email
    const user = await db.user.findUnique({
      where: { email: userEmail },
      include: { companyMemberships: { take: 1 } },
    })
    if (!user?.companyMemberships?.length) return failure(res, "Unauthorized", 401)

    const companyId = user.companyMemberships[0].companyId
    const featured = req.query.featured as string
    const assignedToMe = req.query.assignedToMe === "true"

    const memberUserIds = (await db.companyMember.findMany({ where: { companyId }, select: { userId: true } })).map(m => m.userId)

    const where: any = { employerId: { in: memberUserIds } }
    if (featured) where.featured = featured === "true"
    if (assignedToMe) where.employerId = user.clerkId

    const jobs = await db.job.findMany({
      where,
      include: { employer: { select: { email: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    })
    return res.json(jobs)
  } catch (error) {
    log.error("List company jobs error", error)
    return failure(res, "Internal server error", 500)
  }
})

export default router
