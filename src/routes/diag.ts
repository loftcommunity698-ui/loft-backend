import { Router, Request, Response } from "express"
import { db } from "../lib/db"
import env from "../config/env"

const router = Router()

router.get("/", async (_req: Request, res: Response) => {
  if (process.env.DIAG !== "1") {
    return res.status(404).json({ success: false, error: "Not found" })
  }
  const out: Record<string, unknown> = {}

  const q = async (name: string, sql: string) => {
    try {
      const rows = await db.$queryRawUnsafe<any[]>(sql)
      out[name] = rows.length > 8 ? `${rows.length} rows (first: ${JSON.stringify(rows[0])})` : rows
    } catch (error) {
      out[name] = { error: (error as Error).message }
    }
  }

  await q("connect", `SELECT current_database() AS db, current_user AS usr, version() AS v`)
  await q("tables", `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)
  await q("jobCount", `SELECT COUNT(*)::int AS count FROM "Job"`)
  await q("migrations", `SELECT name, finished_at IS NOT NULL AS applied FROM "_prisma_migrations" ORDER BY started_at`)
  await q(
    "listJobsSql",
    `SELECT * FROM "Job" WHERE ("expiresAt" IS NULL OR "expiresAt" > (now() AT TIME ZONE 'UTC')) ORDER BY "postedDate" DESC, "id" DESC LIMIT 3`,
  )

  res.json({ success: true, env: { databaseUrlHost: new URL(env.databaseUrl).host }, out })
})

export default router