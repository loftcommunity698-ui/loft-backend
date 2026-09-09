import { Router, Response } from "express"
import { db } from "../lib/db"
import { requireAuth } from "../middleware/auth"
import { requireAdmin } from "../middleware/rbac"
import { createLogger } from "../lib/logger"
import type { AuthenticatedRequest } from "../types"
import { failure } from "../lib/response"

const router = Router()
const log = createLogger("admin")

// GET /api/admin/analytics
router.get("/analytics", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const [totalUsers, totalSeekers, totalEmployers, activeJobs, totalApplications, hiredThisMonth, pendingJobs, flaggedJobs, applicationsThisWeek, pendingApps, reviewingApps, shortlistedApps, interviewApps, offeredApps, rejectedApps] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { isApplicant: true } }),
    db.user.count({ where: { isEmployer: true } }),
    db.job.count({ where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
    db.jobApplication.count(),
    db.jobApplication.count({ where: { status: "HIRED" } }),
    0,
    db.job.count({ where: { expiresAt: { lte: new Date() } } }),
    db.jobApplication.count({ where: { appliedAt: { gte: weekAgo } } }),
    db.jobApplication.count({ where: { status: "PENDING" } }),
    db.jobApplication.count({ where: { status: "REVIEWING" } }),
    db.jobApplication.count({ where: { status: "SHORTLISTED" } }),
    db.jobApplication.count({ where: { status: "INTERVIEW" } }),
    db.jobApplication.count({ where: { status: "OFFERED" } }),
    db.jobApplication.count({ where: { status: "REJECTED" } }),
  ])

  const hireRate = totalApplications > 0 ? Math.round((hiredThisMonth / totalApplications) * 100) : 0

  return res.json({ totalUsers, totalSeekers, totalEmployers, activeJobs, totalApplications, applicationsThisWeek, hiredThisMonth, pendingJobs, flaggedJobs, hireRate, pendingApps, reviewingApps, shortlistedApps, interviewApps, offeredApps, rejectedApps, updatedAt: new Date().toISOString() })
})

// GET /api/admin/employers
router.get("/employers", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return

  const members = await db.companyMember.findMany({
    where: { companyId: 1 },
    include: { user: { select: { id: true, clerkId: true, email: true, firstName: true, lastName: true, name: true, profileImage: true, isEmployer: true, employerProfile: { select: { companyName: true, industry: true, contactEmail: true } } } } },
    orderBy: { createdAt: "asc" },
  })

  return res.json(members.map(m => ({
    id: m.id, userId: m.userId, role: m.role, createdAt: m.createdAt,
    user: { clerkId: m.user.clerkId, email: m.user.email, firstName: m.user.firstName, lastName: m.user.lastName, name: m.user.name, profileImage: m.user.profileImage, isEmployer: m.user.isEmployer, companyName: m.user.employerProfile?.companyName || null, industry: m.user.employerProfile?.industry || null },
  })))
})

// POST /api/admin/employers
router.post("/employers", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return

  const { email, role } = req.body
  if (!email) return failure(res, "Email required", 400)

  const user = await db.user.findUnique({ where: { email } })
  if (!user) return failure(res, "User not found", 404)

  const existing = await db.companyMember.findUnique({ where: { companyId_userId: { companyId: 1, userId: user.clerkId } } })
  if (existing) return failure(res, "User is already a member", 409)

  const member = await db.companyMember.create({
    data: { companyId: 1, userId: user.clerkId, role: role === "ADMIN" ? "ADMIN" : "EMPLOYER" },
    include: { user: { select: { email: true, firstName: true, lastName: true, name: true } } },
  })
  return res.status(201).json({ success: true, member })
})

// PATCH /api/admin/employers/:id
router.patch("/employers/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return

  const memberId = parseInt(req.params.id)
  const { role } = req.body
  if (!role || !["ADMIN", "EMPLOYER"].includes(role)) return failure(res, "Invalid role", 400)

  const member = await db.companyMember.findUnique({ where: { id: memberId } })
  if (!member) return failure(res, "Member not found", 404)

  const updated = await db.companyMember.update({
    where: { id: memberId }, data: { role },
    include: { user: { select: { email: true, firstName: true, lastName: true, name: true } } },
  })
  return res.json({ success: true, member: updated })
})

// DELETE /api/admin/employers/:id
router.delete("/employers/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return

  const memberId = parseInt(req.params.id)
  const member = await db.companyMember.findUnique({ where: { id: memberId } })
  if (!member) return failure(res, "Member not found", 404)

  if (member.role === "ADMIN") {
    const adminCount = await db.companyMember.count({ where: { companyId: 1, role: "ADMIN" } })
    if (adminCount <= 1) return failure(res, "Cannot remove the last admin", 400)
  }

  await db.companyMember.delete({ where: { id: memberId } })
  return res.json({ success: true })
})

// GET /api/admin/company
router.get("/company", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return

  const company = await db.company.findUnique({ where: { slug: "loft-community" } })
  if (!company) return failure(res, "Company not found", 404)
  return res.json(company)
})

// PATCH /api/admin/company
router.patch("/company", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return

  const body = req.body
  const { name, description, logo, website, contactEmail } = body
  const company = await db.company.update({
    where: { slug: "loft-community" },
    data: { ...(name !== undefined && { name }), ...(description !== undefined && { description }), ...(logo !== undefined && { logo }), ...(website !== undefined && { website }), ...(contactEmail !== undefined && { contactEmail }) },
  })
  return res.json({ success: true, company })
})

// GET /api/admin/jobs
router.get("/jobs", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return

  const featured = req.query.featured as string
  const whereClause = featured ? { featured: featured === "true" } : {}

  const jobs = await db.job.findMany({
    where: whereClause,
    include: { employer: { select: { email: true } } },
    orderBy: { createdAt: "desc" }, take: 100,
  })

  return res.json({ success: true, data: jobs.map(job => ({
    id: job.id, title: job.title, company: job.company, companyLogo: job.companyLogo,
    location: job.location, remote: job.remote, category: job.category, seniority: job.seniority,
    salaryMin: job.salaryMin, salaryMax: job.salaryMax, currency: job.currency, tags: job.tags,
    featured: job.featured, postedDate: job.postedDate, expiresAt: job.expiresAt,
    createdAt: job.createdAt, employerEmail: job.employer?.email,
  })) })
})

// PATCH /api/admin/jobs - Moderate job
router.patch("/jobs", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return

  const { jobId, action, reason } = req.body
  if (!jobId || !action) return failure(res, "Missing required fields", 400)

  const updateData: any = {}
  switch (action) {
    case "approve": updateData.featured = true; break
    case "reject": updateData.expiresAt = new Date(); break
    case "flag": updateData.featured = false; break
    default: return failure(res, "Invalid action", 400)
  }

  const job = await db.job.update({ where: { id: jobId }, data: updateData })

  const message = action === "approve"
    ? "Your job has been approved and published"
    : action === "reject"
    ? `Your job has been rejected${reason ? `: ${reason}` : ""}`
    : "Your job has been flagged and requires review"

  await db.notification.create({
    data: { userId: job.employerId, title: `Job ${action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Flagged"}`, message, type: "JOB_RECOMMENDED" },
  })

  return res.json({ success: true, job })
})

// GET /api/admin/applications - List all applications across all jobs
router.get("/applications", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return

  const status = req.query.status as string
  const search = req.query.search as string
  const page = Math.max(1, parseInt(req.query.page as string) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50))

  const where: Record<string, unknown> = {}
  if (status) where.status = status

  // Status breakdown for header
  const [
    total,
    pendingCount,
    reviewingCount,
    shortlistedCount,
    interviewCount,
    offeredCount,
    hiredCount,
    rejectedCount,
  ] = await Promise.all([
    db.jobApplication.count({ where }),
    db.jobApplication.count({ where: { status: "PENDING" } }),
    db.jobApplication.count({ where: { status: "REVIEWING" } }),
    db.jobApplication.count({ where: { status: "SHORTLISTED" } }),
    db.jobApplication.count({ where: { status: "INTERVIEW" } }),
    db.jobApplication.count({ where: { status: "OFFERED" } }),
    db.jobApplication.count({ where: { status: "HIRED" } }),
    db.jobApplication.count({ where: { status: "REJECTED" } }),
  ])

  const applications = await db.jobApplication.findMany({
    where,
    include: {
      job: {
        select: {
          id: true, title: true, company: true, companyLogo: true, location: true, remote: true,
          category: true, seniority: true, employer: { select: { email: true } },
        },
      },
      user: {
        select: {
          id: true, clerkId: true, firstName: true, lastName: true,
          email: true, profileImage: true, phone: true,
          profile: { select: { jobTitle: true, experienceYears: true, skills: true } },
        },
      },
    },
    orderBy: { appliedAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  })

  return res.json({
    applications: applications.map(app => ({
      id: app.id, status: app.status, coverLetter: app.coverLetter,
      appliedAt: app.appliedAt, reviewedAt: app.reviewedAt,
      interviewAt: app.interviewAt, employerNotes: app.employerNotes,
      isShortlisted: app.isShortlisted,
      job: app.job,
      candidate: app.user,
    })),
    stats: {
      total, pendingCount, reviewingCount, shortlistedCount,
      interviewCount, offeredCount, hiredCount, rejectedCount,
    },
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
})

// GET /api/admin/applications/:id - Full application detail
router.get("/applications/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return

  const applicationId = parseInt(req.params.id)
  const application = await db.jobApplication.findUnique({
    where: { id: applicationId },
    include: {
      job: {
        include: {
          employer: { select: { email: true } },
        },
      },
      user: {
        select: {
          id: true, clerkId: true, firstName: true, lastName: true,
          email: true, profileImage: true, name: true, phone: true,
          profile: { select: { jobTitle: true, summary: true, experienceYears: true, skills: true } },
        },
      },
      interview: true,
    },
  })

  if (!application) return failure(res, "Application not found", 404)

  return res.json({
    id: application.id, status: application.status, coverLetter: application.coverLetter,
    resumeUrl: application.resumeUrl, appliedAt: application.appliedAt,
    reviewedAt: application.reviewedAt, interviewAt: application.interviewAt,
    rejectedAt: application.rejectedAt, acceptedAt: application.acceptedAt,
    employerNotes: application.employerNotes, isShortlisted: application.isShortlisted,
    englishTestRequired: application.englishTestRequired,
    englishTestScore: application.englishTestScore,
    passedScreening: application.passedScreening,
    job: {
      id: application.job.id, title: application.job.title,
      company: application.job.company, companyLogo: application.job.companyLogo,
      location: application.job.location, remote: application.job.remote,
      category: application.job.category, seniority: application.job.seniority,
      salaryMin: application.job.salaryMin, salaryMax: application.job.salaryMax,
      currency: application.job.currency, tags: application.job.tags,
      description: application.job.description, requirements: application.job.requirements,
      responsibilities: application.job.responsibilities,
      postedDate: application.job.postedDate, expiresAt: application.job.expiresAt,
      employerEmail: application.job.employer?.email,
    },
    candidate: application.user,
    interview: application.interview,
  })
})

export default router
