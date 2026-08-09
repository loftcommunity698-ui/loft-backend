import { db } from '../lib/db'
import { SEARCH_COLUMNS } from './search'

export type JobSort = 'relevance' | 'recent' | 'salary_high' | 'salary_low' | 'remote_first'

export interface ListJobsQuery {
  search?: string
  location?: string
  category?: string
  seniority?: string
  remote?: string
  salaryMin?: number
  salaryMax?: number
  featured?: string
  sort?: JobSort
  cursor?: string
  take?: number
}

export function encodeCursor(values: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(values)).toString('base64url')
}

export function decodeCursor(cursor?: string): Record<string, unknown> | null {
  if (!cursor) return null
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

const SORT_ORDER_SQL: Record<Exclude<JobSort, 'relevance'>, string> = {
  recent: 'ORDER BY "postedDate" DESC, "id" DESC',
  salary_high: 'ORDER BY "salaryMax" DESC NULLS LAST, "id" DESC',
  salary_low: 'ORDER BY "salaryMax" ASC NULLS LAST, "id" DESC',
  remote_first: 'ORDER BY "remote" DESC, "postedDate" DESC, "id" DESC',
}

const BASE_EXPIRY_SQL = `("expiresAt" IS NULL OR "expiresAt" > (now() AT TIME ZONE 'UTC'))`

interface WhereBuild {
  sql: string
  params: unknown[]
}

function buildFilters(params: ListJobsQuery): WhereBuild {
  const clauses: string[] = [BASE_EXPIRY_SQL]
  const p: unknown[] = []

  const push = (sql: string, value: unknown) => {
    clauses.push(sql)
    p.push(value)
  }

  if (params.location) push(`"location" ILIKE '%' || $${p.length + 1} || '%'`, params.location)
  if (params.category) push(`"category" = $${p.length + 1}`, params.category)
  if (params.seniority) push(`"seniority" = $${p.length + 1}`, params.seniority)
  if (params.remote) push(`"remote" = $${p.length + 1}`, params.remote === 'true')
  if (params.featured) push(`"featured" = $${p.length + 1}`, params.featured === 'true')
  if (params.salaryMin !== undefined) push(`"salaryMin" IS NOT NULL AND "salaryMin" >= $${p.length + 1}`, params.salaryMin)
  if (params.salaryMax !== undefined) push(`"salaryMax" IS NOT NULL AND "salaryMax" <= $${p.length + 1}`, params.salaryMax)

  const search = params.search?.trim()
  if (search) {
    if (search.length >= 3) {
      push(
        `to_tsvector('english', ${SEARCH_COLUMNS}) @@ websearch_to_tsquery('english', $${p.length + 1})`,
        search,
      )
    } else {
      push(
        `(${SEARCH_COLUMNS}) ILIKE '%' || $${p.length + 1} || '%'`,
        search,
      )
    }
  }

  return { sql: clauses.join(' AND '), params: p }
}

function buildCursorClause(cursor: Record<string, unknown>, sort: JobSort, offset: number): { sql: string; params: unknown[] } | null {
  const p: unknown[] = []

  const pushVal = (v: unknown) => {
    p.push(v)
    return `$${offset + p.length}`
  }

  const id = cursor.id
  if (!id) return null

  switch (sort) {
    case 'recent':
      return { sql: `("postedDate", "id") < (${pushVal(cursor.postedDate)}::timestamp, ${pushVal(id)})`, params: p }
    case 'salary_high':
      if (cursor.salaryMax === null) {
        return { sql: `("salaryMax" IS NULL AND "id" < ${pushVal(id)})`, params: p }
      }
      return {
        sql: `("salaryMax" < ${pushVal(cursor.salaryMax)} OR ("salaryMax" = ${pushVal(cursor.salaryMax)} AND "id" < ${pushVal(id)}) OR "salaryMax" IS NULL)`,
        params: p,
      }
    case 'salary_low':
      if (cursor.salaryMax === null) {
        return { sql: `("salaryMax" IS NULL AND "id" < ${pushVal(id)})`, params: p }
      }
      return {
        sql: `("salaryMax" > ${pushVal(cursor.salaryMax)} OR ("salaryMax" = ${pushVal(cursor.salaryMax)} AND "id" < ${pushVal(id)}) OR "salaryMax" IS NULL)`,
        params: p,
      }
    case 'remote_first':
      return {
        sql: `("remote" < ${pushVal(cursor.remote)} OR ("remote" = ${pushVal(cursor.remote)} AND ("postedDate", "id") < (${pushVal(cursor.postedDate)}::timestamp, ${pushVal(id)})))`,
        params: p,
      }
    case 'relevance': {
      const q = pushVal(cursor.query)
      const r = pushVal(cursor.rank)
      const rankExpr = `ts_rank(to_tsvector('english', ${SEARCH_COLUMNS}), websearch_to_tsquery('english', ${q}::text))`
      return {
        sql: `(${rankExpr} < ${r} OR (${rankExpr} = ${r} AND "id" < ${pushVal(id)}))`,
        params: p,
      }
    }
    default:
      return null
  }
}

export async function listJobs(params: ListJobsQuery) {
  const takeRaw = params.take
  const take = takeRaw !== undefined && Number.isInteger(takeRaw)
    ? Math.min(Math.max(takeRaw, 1), 100)
    : 12
  const search = params.search?.trim()
  const relevanceValid = search !== undefined && search.length >= 3
  const sort = (params.sort ?? 'recent') as JobSort
  const effectiveSort: JobSort = sort === 'relevance' && !relevanceValid ? 'recent' : sort

  const filters = buildFilters(params)
  const cursor = decodeCursor(params.cursor)

  const extraParams: unknown[] = []
  const rankExpr = `ts_rank(to_tsvector('english', ${SEARCH_COLUMNS}), websearch_to_tsquery('english', $${filters.params.length + 1}))`
  if (effectiveSort === 'relevance') {
    extraParams.push(search!)
  }

  const selectColumns = effectiveSort === 'relevance'
    ? `*, ${rankExpr} AS "rank"`
    : `*`

  const cursorClause = cursor ? buildCursorClause(cursor, effectiveSort, filters.params.length + extraParams.length) : null
  let whereSql = filters.sql
  let allParams = [...filters.params, ...extraParams]
  if (cursorClause) {
    whereSql = `(${whereSql}) AND (${cursorClause.sql})`
    allParams = allParams.concat(cursorClause.params)
  }

  const orderBySql = effectiveSort === 'relevance'
    ? `ORDER BY "rank" DESC, "id" DESC`
    : SORT_ORDER_SQL[effectiveSort]

  const listSql = `SELECT ${selectColumns} FROM "Job" WHERE ${whereSql} ${orderBySql} LIMIT $${allParams.length + 1}`
  const jobs = await db.$queryRawUnsafe<any[]>(listSql, ...[...allParams, take + 1])

  const countSql = `SELECT COUNT(*)::int AS count FROM "Job" WHERE ${filters.sql}`
  const countRows = await db.$queryRawUnsafe<[{ count: number }]>(countSql, ...filters.params)
  const count = countRows[0]?.count ?? 0

  const hasMore = jobs.length > take
  const items = hasMore ? jobs.slice(0, take) : jobs

  let nextCursor: string | null = null
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1]
    const tuple: Record<string, unknown> = { id: last.id }
    if (effectiveSort === 'recent') tuple.postedDate = last.postedDate
    if (effectiveSort === 'salary_high' || effectiveSort === 'salary_low') tuple.salaryMax = last.salaryMax ?? null
    if (effectiveSort === 'remote_first') { tuple.remote = last.remote; tuple.postedDate = last.postedDate }
    if (effectiveSort === 'relevance') { tuple.rank = last.rank; tuple.query = search }
    nextCursor = encodeCursor(tuple)
  }

  return { jobs: items, pagination: { total: count, cursor: nextCursor } }
}

export async function listTags(q?: string) {
  const query = q?.trim() || ''
  const where = query
    ? `WHERE EXISTS (SELECT 1 FROM unnest("tags") AS t WHERE t ILIKE '%' || $1 || '%') AND ${BASE_EXPIRY_SQL}`
    : `WHERE ${BASE_EXPIRY_SQL}`
  const rows = await db.$queryRawUnsafe<{ name: string; count: number }[]>(
    `SELECT tag AS name, COUNT(*)::int AS count FROM "Job", unnest("tags") AS tag ${where} GROUP BY tag ORDER BY count DESC, tag ASC LIMIT 20`,
    ...(query ? [query] : []),
  )
  return rows
}

export async function getJobFacets() {
  const group = (col: string) => db.$queryRawUnsafe<{ name: string; count: number }[]>(
    `SELECT ${col} AS name, COUNT(*)::int AS count FROM "Job" WHERE ${BASE_EXPIRY_SQL} GROUP BY ${col} ORDER BY count DESC, ${col} ASC LIMIT 20`,
  )
  const [categories, seniorities, locations, remoteRows] = await Promise.all([
    group('category'),
    group('seniority'),
    group('location'),
    db.$queryRawUnsafe<{ remote: boolean; count: number }[]>(
      `SELECT "remote", COUNT(*)::int AS count FROM "Job" WHERE ${BASE_EXPIRY_SQL} GROUP BY "remote"`,
    ),
  ])
  const remote = { true: 0, false: 0 }
  for (const r of remoteRows) {
    if (r.remote) remote.true = r.count
    else remote.false = r.count
  }
  return { categories, seniorities, locations, remote }
}
