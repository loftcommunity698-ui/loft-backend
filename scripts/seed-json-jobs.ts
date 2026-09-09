import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const JOBS_JSON_PATH = "../loft_commmunity/client/src/data/jobs.json"

async function main() {
  const fs = await import("fs")
  const raw = fs.readFileSync(JOBS_JSON_PATH, "utf-8")
  const data = JSON.parse(raw)
  const jobs: any[] = data.jobs || []

  console.log(`Found ${jobs.length} jobs in JSON data`)

  const employerProfile = await prisma.employerProfile.findFirst()
  if (!employerProfile) {
    console.error("No employer profile found in DB.")
    process.exit(1)
  }

  const company = await prisma.company.findFirst()
  if (!company) {
    console.error("No company found in DB.")
    process.exit(1)
  }

  let created = 0
  let skipped = 0

  for (const j of jobs) {
    const existing = await prisma.job.findFirst({
      where: { title: j.title, employerId: employerProfile.userId },
    })
    if (existing) {
      skipped++
      continue
    }

    const location = [j.city, j.country].filter(Boolean).join(", ") || j.location || "Remote"

    await prisma.job.create({
      data: {
        title: j.title,
        company: employerProfile.companyName,
        companyLogo: employerProfile.companyLogo || null,
        location,
        remote: j.remoteWork ?? true,
        salaryMin: j.salaryMin ? j.salaryMin : null,
        salaryMax: j.salaryMax ? j.salaryMax : null,
        currency: j.salaryCurrency || "USD",
        tags: j.requiredSkills || j.skills || [],
        category: j.category || "General",
        seniority: j.experienceLevel || "Mid",
        description: j.description || "",
        requirements: Array.isArray(j.requirements) ? j.requirements : j.requirements ? [j.requirements] : [],
        responsibilities: [],
        featured: j.isFeatured ?? false,
        employerId: employerProfile.userId,
      },
    })
    created++
  }

  console.log(`Done: ${created} created, ${skipped} skipped`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
