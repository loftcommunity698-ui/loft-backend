import { db } from '../lib/db'

export const SEARCH_COLUMNS = `coalesce(title, '') || ' ' || coalesce(company, '') || ' ' || coalesce(description, '') || ' ' || coalesce(immutable_array_to_string(tags, ' '), '') || ' ' || coalesce(category, '') || ' ' || coalesce(seniority, '') || ' ' || coalesce(location, '') || ' ' || coalesce(immutable_array_to_string(requirements, ' '), '') || ' ' || coalesce(immutable_array_to_string(responsibilities, ' '), '')`

export const SEARCH_VECTOR_EXPR = `to_tsvector('english', ${SEARCH_COLUMNS})`

export async function ensureSearchIndex() {
  await db.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION immutable_array_to_string(arr text[], sep text) RETURNS text
    LANGUAGE SQL IMMUTABLE STRICT AS
    $$ SELECT array_to_string($1, $2) $$
  `)
  try {
    await db.$executeRawUnsafe(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_search_v2
      ON "Job" USING GIN (${SEARCH_VECTOR_EXPR})
    `)
  } catch {
    try {
      await db.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_job_search_v2
        ON "Job" USING GIN (${SEARCH_VECTOR_EXPR})
      `)
    } catch {
      // Index already exists or table is empty — non-critical
    }
  }
  try {
    await db.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_job_search`)
  } catch {
    // Legacy index absent — non-critical
  }
}
