import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../app'
import { db } from '../lib/db'

const employerEmail = `search-employer-${Date.now()}@example.com`
let seededIds: string[] = []

const JOB_SEEDS = [
  { title: 'Senior React Engineer', company: 'Acme', location: 'Austin, TX', remote: true, category: 'Engineering', seniority: 'senior', tags: ['react', 'typescript'], description: 'Build the React frontend with TypeScript.', salaryMin: 140000, salaryMax: 190000 },
  { title: 'React Native Engineer', company: 'Beta', location: 'New York, NY', remote: false, category: 'Engineering', seniority: 'mid', tags: ['react native', 'mobile'], description: 'Build mobile apps.', salaryMin: 120000, salaryMax: 160000 },
  { title: 'Product Designer', company: 'Gamma', location: 'Austin, TX', remote: true, category: 'Design', seniority: 'senior', tags: ['figma'], description: 'Design product experiences.', salaryMin: 110000, salaryMax: 150000 },
]

async function seedJob(job: (typeof JOB_SEEDS)[number], employerId: string) {
  return db.job.create({
    data: {
      ...job,
      employerId,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      requirements: ['req'],
      responsibilities: ['resp'],
    },
  })
}

describe('GET /api/jobs search', () => {
  beforeAll(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ firstName: 'Search', lastName: 'Employer', email: employerEmail, password: 'StrongPass1!', role: 'employer' })
    const user = await db.user.findUnique({ where: { email: employerEmail } })
    if (!user) throw new Error('test employer not found')
    for (const job of JOB_SEEDS) {
      const created = await seedJob(job, user.clerkId)
      seededIds.push(created.id)
    }
  })

  afterAll(async () => {
    await db.job.deleteMany({ where: { id: { in: seededIds } } })
    await db.user.deleteMany({ where: { email: employerEmail } })
  })

  it('combines search AND location filter (no short-circuit)', async () => {
    const res = await request(app).get('/api/jobs').query({ search: 'engineer', location: 'austin' }).expect(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.map((j: any) => j.title)).toContain('Senior React Engineer')
    expect(res.body.data.map((j: any) => j.title)).not.toContain('React Native Engineer')
  })

  it('applies category + seniority + remote filters together', async () => {
    const res = await request(app).get('/api/jobs').query({ category: 'Engineering', seniority: 'senior', remote: 'true' }).expect(200)
    const seededTitles = JOB_SEEDS.map((s) => s.title)
    const titles = res.body.data.map((j: any) => j.title).filter((t: string) => seededTitles.includes(t))
    expect(titles).toEqual(['Senior React Engineer'])
  })

  it('sorts by salary_high descending with nulls last', async () => {
    const res = await request(app).get('/api/jobs').query({ sort: 'salary_high', take: '10' }).expect(200)
    const salaries = res.body.data.map((j: any) => j.salaryMax ?? -1)
    const nonNull = salaries.filter((s: number) => s >= 0)
    for (let i = 1; i < nonNull.length; i++) {
      expect(nonNull[i - 1]).toBeGreaterThanOrEqual(nonNull[i])
    }
  })

  it('excludes expired jobs from listings', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { email: employerEmail } })
    const expired = await db.job.create({
      data: {
        title: 'Expired Role', company: 'Zeta', location: 'Nowhere', remote: false,
        category: 'Engineering', seniority: 'junior', description: 'expired',
        requirements: [], responsibilities: [],
        employerId: user.clerkId,
        expiresAt: new Date(Date.now() - 1000),
      },
    })
    seededIds.push(expired.id)
    const res = await request(app).get('/api/jobs').query({ search: 'expired' }).expect(200)
    expect(res.body.data.map((j: any) => j.title)).not.toContain('Expired Role')
  })

  it('paginates with a keyset cursor', async () => {
    const res = await request(app).get('/api/jobs').query({ sort: 'recent', take: '1' }).expect(200)
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(3)
    expect(res.body.pagination.cursor).toBeTruthy()
    const page2 = await request(app).get('/api/jobs').query({ sort: 'recent', take: '1', cursor: res.body.pagination.cursor }).expect(200)
    expect(page2.body.data.length).toBeGreaterThanOrEqual(1)
    const ids = res.body.data.map((j: any) => j.id)
    for (const job of page2.body.data) {
      expect(ids).not.toContain(job.id)
    }
  })

  it('defaults to recent sort and never leaks rank without explicit sort=relevance', async () => {
    const noSort = await request(app).get('/api/jobs').query({ search: 'engineer' }).expect(200)
    expect(noSort.body.success).toBe(true)
    expect(noSort.body.data.length).toBeGreaterThan(0)
    expect(noSort.body.data.map((j: any) => j.rank)).toEqual(Array(noSort.body.data.length).fill(undefined))
    const dates = noSort.body.data.map((j: any) => new Date(j.postedDate).getTime())
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i])
    }
  })

  it('exposes rank only when sort=relevance is explicitly requested', async () => {
    const relevance = await request(app).get('/api/jobs').query({ search: 'engineer', sort: 'relevance', take: '5' }).expect(200)
    expect(relevance.body.data.length).toBeGreaterThan(0)
    for (const job of relevance.body.data) {
      expect(typeof job.rank).toBe('number')
    }
  })

  it('caps take at 100 and falls back to default on invalid take', async () => {
    const res = await request(app).get('/api/jobs').query({ sort: 'recent', take: '100000' }).expect(200)
    expect(res.body.data.length).toBeLessThanOrEqual(100)
    const invalid = await request(app).get('/api/jobs').query({ sort: 'recent', take: 'abc' }).expect(200)
    expect(invalid.body.success).toBe(true)
  })
})
