import { Router, Request, Response } from "express"
import { listTags } from "../services/jobs"

const router = Router()

// GET /api/skills/search?q=
router.get("/search", async (req: Request, res: Response) => {
  const q = (req.query.q as string) || ""
  if (q.length < 1) return res.json([])

  const tags = await listTags(q)
  return res.json(tags)
})

export default router
