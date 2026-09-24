import { Router, Request, Response } from "express"
import { db } from "../lib/db"
import { requireAuth, optionalAuth } from "../middleware/auth"
import { createLogger } from "../lib/logger"
import type { AuthenticatedRequest } from "../types"
import { listJobs, listTags, getJobFacets } from "../services/jobs"
import { success, paginated, created, noContent, failure } from "../lib/response"
import { sendEmail, shouldSendEmail } from "../lib/email"
import { sendEvent } from "../lib/sse"
import env from "../config/env"

const router = Router()
const log = createLogger("jobs")

// GET /api/jobs/tags/search
router.get("/tags/search", async (req: Request, res: Response) => {
  try {
    const tags = await listTags(typeof req.query.q === "string" ? req.query.q : undefined)
    success(res, tags)
  } catch (error) {
    log.error("List tags error", error)
    return failure(res, "Internal server error", 500)
  }
})

// GET /api/jobs/facets
router.get("/facets", async (_req: Request, res: Response) => {
  try {
    success(res, await getJobFacets())
  } catch (error) {
    log.error("Get job facets error", error)
    return failure(res, "Internal server error", 500)
  }
})

// GET /api/jobs - Search and list jobs (canonical envelope)
router.get("/", async (req: Request, res: Response) => {
  try {
    const result = await listJobs({
      search: req.query.search as string | undefined,
      location: req.query.location as string | undefined,
      category: req.query.category as string | undefined,
      seniority: req.query.seniority as string | undefined,
      remote: req.query.remote as string | undefined,
      salaryMin: req.query.salaryMin !== undefined ? Number(req.query.salaryMin) : undefined,
      salaryMax: req.query.salaryMax !== undefined ? Number(req.query.salaryMax) : undefined,
      featured: req.query.featured as string | undefined,
      sort: req.query.sort as 'recent' | 'relevance' | 'salary_high' | 'salary_low' | 'remote_first' | undefined,
      cursor: req.query.cursor as string | undefined,
      take: req.query.take !== undefined ? Number(req.query.take) : undefined,
    })
    paginated(res, result.jobs, result.pagination.total, result.pagination.cursor ?? undefined)
  } catch (error) {
    log.error("List jobs error", error)
    return failure(res, "Internal server error", 500)
  }
})

// GET /api/jobs/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const job = await db.job.findUnique({ where: { id: req.params.id } })
    if (!job) return failure(res, "Job not found", 404)
    success(res, job)
  } catch (error) {
    log.error("Get job error", error)
    return failure(res, "Internal server error", 500)
  }
})

// POST /api/jobs (employer only)
router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.user.findUnique({ where: { email: req.user!.email } })
    if (!user) return failure(res, "Not authorized", 403)
    const { title, company, companyLogo, location, remote, salaryMin, salaryMax, currency, tags, category, seniority, description, requirements, responsibilities, featured } = req.body
    if (!title || !company || !location || !category || !seniority || !description) {
      return failure(res, "Missing required fields", 400)
    }
    const job = await db.job.create({
      data: {
        title, company, companyLogo, location,
        remote: remote ?? false,
        salaryMin: salaryMin ?? null,
        salaryMax: salaryMax ?? null,
        currency: currency ?? "USD",
        tags: tags ?? [],
        category, seniority, description,
        requirements: requirements ?? [],
        responsibilities: responsibilities ?? [],
        featured: featured ?? false,
        employerId: user.clerkId,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    })
    created(res, job)
  } catch (error) {
    log.error("Create job error", error)
    return failure(res, "Internal server error", 500)
  }
})

// PATCH /api/jobs/:id
router.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.user.findUnique({ where: { email: req.user!.email } })
    if (!user) return failure(res, "Not authorized", 403)
    const job = await db.job.findUnique({ where: { id: req.params.id } })
    if (!job) return failure(res, "Job not found", 404)
    if (job.employerId !== user.clerkId) return failure(res, "Not authorized", 403)

    const allowed = ["title", "company", "companyLogo", "location", "remote", "salaryMin", "salaryMax", "currency", "tags", "category", "seniority", "description", "requirements", "responsibilities", "featured"]
    const updateData: Record<string, unknown> = {}
    for (const key of allowed) {
      if (req.body[key] !== undefined) updateData[key] = req.body[key]
    }
    const updated = await db.job.update({ where: { id: job.id }, data: updateData })
    success(res, updated)
  } catch (error) {
    log.error("Update job error", error)
    return failure(res, "Internal server error", 500)
  }
})

// DELETE /api/jobs/:id
router.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.user.findUnique({ where: { email: req.user!.email } })
    if (!user) return failure(res, "Not authorized", 403)
    const job = await db.job.findUnique({ where: { id: req.params.id } })
    if (!job) return failure(res, "Job not found", 404)
    if (job.employerId !== user.clerkId) return failure(res, "Not authorized", 403)
    await db.job.delete({ where: { id: job.id } })
    noContent(res)
  } catch (error) {
    log.error("Delete job error", error)
    return failure(res, "Internal server error", 500)
  }
})

// POST /api/jobs/:id/apply - Apply to a job (authenticated users or anonymous guests)
router.post("/:id/apply", optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user ? await db.user.findUnique({ where: { email: req.user.email } }) : null

    const jobId = req.params.id
    const job = await db.job.findUnique({ where: { id: jobId } })
    if (!job) return failure(res, "Job not found", 404)

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const { coverLetter, resumeUrl, contactEmail, guestName: rawGuestName, guestEmail: rawGuestEmail } = req.body

    let guestName: string | undefined
    let guestEmail: string | undefined
    if (!user) {
      guestName = typeof rawGuestName === "string" ? rawGuestName.trim() : ""
      guestEmail = typeof rawGuestEmail === "string" ? rawGuestEmail.trim().toLowerCase() : ""
      if (!guestName || guestName.length > 120 || !emailRegex.test(guestEmail)) {
        return failure(res, "Guest name and email are required to apply", 400)
      }
    }

    if (coverLetter && coverLetter.length > 5000) return failure(res, "Cover letter too long (max 5000 characters)", 400)

    const normalizedContactEmail = contactEmail ? String(contactEmail).trim().toLowerCase() : undefined
    if (user) {
      if (normalizedContactEmail && !emailRegex.test(normalizedContactEmail)) {
        return failure(res, "Invalid contact email", 400)
      }
    }
    const effectiveContactEmail = user ? normalizedContactEmail || null : guestEmail

    const existing = user
      ? await db.jobApplication.findFirst({ where: { userId: user.clerkId, jobId } })
      : await db.jobApplication.findFirst({ where: { guestEmail, jobId } })
    if (existing) return failure(res, user ? "Already applied to this job" : "You've already applied to this job with this email", 400)

    const application = await db.jobApplication.create({
      data: {
        userId: user?.clerkId ?? null,
        guestName: user ? undefined : guestName,
        guestEmail: user ? undefined : guestEmail,
        jobId: job.id,
        coverLetter: coverLetter || undefined,
        resumeUrl: resumeUrl || null,
        contactEmail: effectiveContactEmail,
        status: "PENDING",
      },
      include: {
        job: { include: { employer: { select: { firstName: true, lastName: true, email: true } } } },
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    })

    await db.notification.create({
      data: { userId: job.employerId, title: "New Application", message: `New application for ${job.title}`, type: "APPLICATION_RECEIVED", data: { applicationId: application.id, jobId } },
      select: { id: true },
    })

    if (user) {
      await db.notification.create({
        data: {
          userId: user.clerkId,
          title: "Application submitted",
          message: `Your application for ${job.title} has been submitted and will be reviewed. We will contact you via email for any further updates.`,
          type: "APPLICATION_RECEIVED",
          link: `/applications/${application.id}`,
          data: { applicationId: application.id, jobId },
        },
        select: { id: true },
      })
    }

    sendEvent(job.employerId, "new_notification", {
      title: "New Application",
      message: `New application for ${job.title}`,
      type: "APPLICATION_RECEIVED",
      link: `/hiring-workflow`,
    })

    if (user) {
      sendEvent(user.clerkId, "new_notification", {
        title: "Application submitted",
        message: `Your application for ${job.title} has been submitted and will be reviewed. We will contact you via email for any further updates.`,
        type: "APPLICATION_RECEIVED",
        link: `/applications/${application.id}`,
      })
    }

    const companyName = application.job.company || job.company || "LoftCommunity"
    const applicantName =
      [application.user?.firstName, application.user?.lastName].filter(Boolean).join(" ") ||
      application.guestName ||
      "A candidate"

    // Applicant confirmation email is delivered client-side via EmailJS.
    const employerShouldNotify = await shouldSendEmail(job.employerId, "applicationUpdates")
    if (employerShouldNotify) {
      await sendEmail({ type: "new_applicant", recipient: application.job.employer.email, data: { jobTitle: job.title, candidateName: applicantName } })
    }

    const applicationUrl = `${env.frontendUrl}/applications/${application.id}`
    const candidateEmail = application.contactEmail || application.guestEmail || application.user?.email || undefined
    try {
      await sendEmail({
        type: "new_applicant",
        recipient: env.supportEmail,
        data: {
          jobTitle: job.title,
          candidateName: applicantName,
          companyName: application.job.company || job.company || "LoftCommunity",
          candidateEmail,
          resumeUrl: application.resumeUrl || undefined,
          applicationUrl,
        },
      })
    } catch (sendErr) {
      log.error("Support inbox application notification error", sendErr)
    }

    return res.status(201).json({ success: true, application: { id: application.id, status: application.status, appliedAt: application.appliedAt } })
  } catch (error) {
    log.error("Apply error", error)
    return failure(res, "Internal server error", 500)
  }
})

// GET /api/jobs/:id/candidates - List candidates for a job
router.get("/:id/candidates", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userEmail = req.user!.email
    const sort = (req.query.sort as string) || "matchScore"
    const jobId = req.params.id

    const job = await db.job.findUnique({ where: { id: jobId } })
    if (!job) return failure(res, "Job not found", 404)

    const user = await db.user.findUnique({ where: { email: userEmail } })
    if (!user) return failure(res, "Not authorized", 403)
    if (job.employerId !== user.clerkId) return failure(res, "Not authorized", 403)

    const applications = await db.jobApplication.findMany({
      where: { jobId: job.id },
      include: { user: { include: { profile: { include: { skillsRelation: { include: { skill: true } } } } } } },
    })

    const jobTags = job.tags || []
    const candidates = applications.map((app: any) => {
      const userSkills = (app.user?.profile?.skillsRelation || []).map((s: any) => s.skill.name)
      const matchedSkills = jobTags.filter((t: string) => userSkills.includes(t)).length
      const matchScore = jobTags.length > 0 ? Math.round((matchedSkills / jobTags.length) * 100) : 0
      return { id: app.id, status: app.status, appliedAt: app.appliedAt, coverLetter: app.coverLetter, matchScore, matchedSkills, totalRequired: jobTags.length, candidate: app.user ? { id: app.user.id, clerkId: app.user.clerkId, name: app.user.name, firstName: app.user.firstName, lastName: app.user.lastName, email: app.user.email, profileImage: app.user.profileImage, profile: app.user.profile } : null }
    })

    if (sort === "date") candidates.sort((a: any, b: any) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime())
    else candidates.sort((a: any, b: any) => b.matchScore - a.matchScore)

    return res.json({ job: { id: job.id, title: job.title, tags: jobTags }, candidates, total: candidates.length })
  } catch (error) {
    log.error("Candidates error", error)
    return failure(res, "Internal server error", 500)
  }
})

// GET /api/jobs/:id/metrics - Job metrics
router.get("/:id/metrics", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userEmail = req.user!.email
    const jobId = req.params.id

    const job = await db.job.findUnique({ where: { id: jobId } })
    if (!job) return failure(res, "Job not found", 404)

    const user = await db.user.findUnique({ where: { email: userEmail } })
    if (job.employerId !== user?.clerkId) return failure(res, "Not authorized", 403)

    const apps = await db.jobApplication.findMany({
      where: { jobId },
      include: { user: { include: { profile: { include: { skillsRelation: { include: { skill: true } } } } } } },
    })

    const count = (s: string) => apps.filter(a => a.status === s).length
    const jobTags = job.tags || []
    const scores = apps.map(app => {
      const userSkills = (app.user?.profile?.skillsRelation || []).map(s => s.skill.name)
      return jobTags.length > 0 ? Math.round((jobTags.filter(t => userSkills.includes(t)).length / jobTags.length) * 100) : 0
    })
    const avgMatchScore = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0

    return res.json({
      jobId, totalApplications: apps.length, pendingApplications: count("PENDING"),
      reviewingApplications: count("REVIEWING"), shortlistedApplications: count("SHORTLISTED"),
      interviewingApplications: count("INTERVIEW"), offeredApplications: count("OFFERED"),
      hiredApplications: count("HIRED"), rejectedApplications: count("REJECTED"),
      conversionRate: apps.length > 0 ? Math.round((count("HIRED") / apps.length) * 100) : 0,
      avgMatchScore, totalCandidates: apps.length,
    })
  } catch (error) {
    log.error("Metrics error", error)
    return failure(res, "Internal server error", 500)
  }
})

// POST /api/jobs/:id/report - Report a job
router.post("/:id/report", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.user.findUnique({ where: { email: req.user!.email } })
    if (!user) return failure(res, "User not found", 404)

    const jobId = req.params.id
    const { reason } = req.body
    if (!reason) return failure(res, "Reason is required", 400)

    await db.report.create({ data: { reporterId: user.clerkId, reportedType: "JOB", reportedId: jobId, reason } })
    return res.json({ success: true, message: "Report submitted. We will review it shortly." })
  } catch (error) {
    log.error("Report error", error)
    return failure(res, "Internal server error", 500)
  }
})

export default router
