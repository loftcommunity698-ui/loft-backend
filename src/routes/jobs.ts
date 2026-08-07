import { Router, Request, Response } from "express"
import { db } from "../lib/db"
import { requireAuth } from "../middleware/auth"
import { createLogger } from "../lib/logger"
import type { AuthenticatedRequest } from "../types"
import { listJobs, listTags, getJobFacets } from "../services/jobs"
import { success, paginated, created, noContent } from "../lib/response"

const router = Router()
const log = createLogger("jobs")

// GET /api/jobs/tags/search
router.get("/tags/search", async (req: Request, res: Response) => {
  try {
    const tags = await listTags(typeof req.query.q === "string" ? req.query.q : undefined)
    success(res, tags)
  } catch (error) {
    log.error("List tags error", error)
    return res.status(500).json({ success: false, error: "Internal server error" })
  }
})

// GET /api/jobs/facets
router.get("/facets", async (_req: Request, res: Response) => {
  try {
    success(res, await getJobFacets())
  } catch (error) {
    log.error("Get job facets error", error)
    return res.status(500).json({ success: false, error: "Internal server error" })
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
    return res.status(500).json({ success: false, error: "Internal server error" })
  }
})

// GET /api/jobs/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const job = await db.job.findUnique({ where: { id: req.params.id } })
    if (!job) return res.status(404).json({ success: false, error: "Job not found" })
    success(res, job)
  } catch (error) {
    log.error("Get job error", error)
    return res.status(500).json({ success: false, error: "Internal server error" })
  }
})

// POST /api/jobs (employer only)
router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.user.findUnique({ where: { email: req.user!.email } })
    if (!user) return res.status(403).json({ success: false, error: "Not authorized" })
    const { title, company, companyLogo, location, remote, salaryMin, salaryMax, currency, tags, category, seniority, description, requirements, responsibilities, featured } = req.body
    if (!title || !company || !location || !category || !seniority || !description) {
      return res.status(400).json({ success: false, error: "Missing required fields" })
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
    return res.status(500).json({ success: false, error: "Internal server error" })
  }
})

// PATCH /api/jobs/:id
router.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.user.findUnique({ where: { email: req.user!.email } })
    if (!user) return res.status(403).json({ success: false, error: "Not authorized" })
    const job = await db.job.findUnique({ where: { id: req.params.id } })
    if (!job) return res.status(404).json({ success: false, error: "Job not found" })
    if (job.employerId !== user.clerkId) return res.status(403).json({ success: false, error: "Not authorized" })

    const allowed = ["title", "company", "companyLogo", "location", "remote", "salaryMin", "salaryMax", "currency", "tags", "category", "seniority", "description", "requirements", "responsibilities", "featured"]
    const updateData: Record<string, unknown> = {}
    for (const key of allowed) {
      if (req.body[key] !== undefined) updateData[key] = req.body[key]
    }
    const updated = await db.job.update({ where: { id: job.id }, data: updateData })
    success(res, updated)
  } catch (error) {
    log.error("Update job error", error)
    return res.status(500).json({ error: "Internal server error" })
  }
})

// DELETE /api/jobs/:id
router.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.user.findUnique({ where: { email: req.user!.email } })
    if (!user) return res.status(403).json({ success: false, error: "Not authorized" })
    const job = await db.job.findUnique({ where: { id: req.params.id } })
    if (!job) return res.status(404).json({ success: false, error: "Job not found" })
    if (job.employerId !== user.clerkId) return res.status(403).json({ success: false, error: "Not authorized" })
    await db.job.delete({ where: { id: job.id } })
    noContent(res)
  } catch (error) {
    log.error("Delete job error", error)
    return res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/jobs/:id/apply - Apply to a job
router.post("/:id/apply", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.user.findUnique({ where: { email: req.user!.email } })
    if (!user) return res.status(404).json({ success: false, error: "User not found" })

    const jobId = req.params.id
    const job = await db.job.findUnique({ where: { id: jobId } })
    if (!job) return res.status(404).json({ success: false, error: "Job not found" })

    const existing = await db.jobApplication.findFirst({ where: { userId: user.clerkId, jobId } })
    if (existing) return res.status(400).json({ success: false, error: "Already applied to this job" })

    const { coverLetter, resumeUrl } = req.body
    if (coverLetter && coverLetter.length > 5000) return res.status(400).json({ success: false, error: "Cover letter too long (max 5000 characters)" })
    const application = await db.jobApplication.create({
      data: { userId: user.clerkId, jobId, coverLetter, resumeUrl: resumeUrl || null, status: "PENDING" },
      include: {
        job: { include: { employer: { select: { firstName: true, lastName: true, email: true } } } },
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    })

    await db.notification.create({
      data: { userId: job.employerId, title: "New Application", message: `New application for ${job.title}`, type: "APPLICATION_RECEIVED", data: { applicationId: application.id, jobId } },
    })

    return res.status(201).json({ success: true, application: { id: application.id, status: application.status, appliedAt: application.appliedAt } })
  } catch (error) {
    log.error("Apply error", error)
    return res.status(500).json({ error: "Internal server error" })
  }
})

// GET /api/jobs/:id/candidates - List candidates for a job
router.get("/:id/candidates", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userEmail = req.user!.email
    const sort = (req.query.sort as string) || "matchScore"
    const jobId = req.params.id

    const job = await db.job.findUnique({ where: { id: jobId } })
    if (!job) return res.status(404).json({ success: false, error: "Job not found" })

    const user = await db.user.findUnique({ where: { email: userEmail } })
    if (!user) return res.status(403).json({ success: false, error: "Not authorized" })
    if (job.employerId !== user.clerkId) return res.status(403).json({ success: false, error: "Not authorized" })

    const applications = await db.jobApplication.findMany({
      where: { jobId: job.id },
      include: { user: { include: { profile: { include: { skillsRelation: { include: { skill: true } } } } } } },
    })

    const jobTags = job.tags || []
    const candidates = applications.map((app: any) => {
      const userSkills = (app.user.profile?.skillsRelation || []).map((s: any) => s.skill.name)
      const matchedSkills = jobTags.filter((t: string) => userSkills.includes(t)).length
      const matchScore = jobTags.length > 0 ? Math.round((matchedSkills / jobTags.length) * 100) : 0
      return { id: app.id, status: app.status, appliedAt: app.appliedAt, coverLetter: app.coverLetter, matchScore, matchedSkills, totalRequired: jobTags.length, candidate: { id: app.user.id, clerkId: app.user.clerkId, name: app.user.name, firstName: app.user.firstName, lastName: app.user.lastName, email: app.user.email, profileImage: app.user.profileImage, profile: app.user.profile } }
    })

    if (sort === "date") candidates.sort((a: any, b: any) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime())
    else candidates.sort((a: any, b: any) => b.matchScore - a.matchScore)

    return res.json({ job: { id: job.id, title: job.title, tags: jobTags }, candidates, total: candidates.length })
  } catch (error) {
    log.error("Candidates error", error)
    return res.status(500).json({ error: "Internal server error" })
  }
})

// GET /api/jobs/:id/metrics - Job metrics
router.get("/:id/metrics", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userEmail = req.user!.email
    const jobId = req.params.id

    const job = await db.job.findUnique({ where: { id: jobId } })
    if (!job) return res.status(404).json({ success: false, error: "Job not found" })

    const user = await db.user.findUnique({ where: { email: userEmail } })
    if (job.employerId !== user?.clerkId) return res.status(403).json({ success: false, error: "Not authorized" })

    const apps = await db.jobApplication.findMany({
      where: { jobId },
      include: { user: { include: { profile: { include: { skillsRelation: { include: { skill: true } } } } } } },
    })

    const count = (s: string) => apps.filter(a => a.status === s).length
    const jobTags = job.tags || []
    const scores = apps.map(app => {
      const userSkills = (app.user.profile?.skillsRelation || []).map(s => s.skill.name)
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
    return res.status(500).json({ error: "Internal server error" })
  }
})

// POST /api/jobs/:id/report - Report a job
router.post("/:id/report", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.user.findUnique({ where: { email: req.user!.email } })
    if (!user) return res.status(404).json({ success: false, error: "User not found" })

    const jobId = req.params.id
    const { reason } = req.body
    if (!reason) return res.status(400).json({ success: false, error: "Reason is required" })

    await db.report.create({ data: { reporterId: user.clerkId, reportedType: "JOB", reportedId: jobId, reason } })
    return res.json({ success: true, message: "Report submitted. We will review it shortly." })
  } catch (error) {
    log.error("Report error", error)
    return res.status(500).json({ error: "Internal server error" })
  }
})

export default router
