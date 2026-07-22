import { Router } from "express"

const router = Router()

let visitorCount = 0

router.post("/visit", (_req, res) => {
  visitorCount++
  res.json({ count: visitorCount })
})

router.get("/visitors", (_req, res) => {
  res.json({ count: visitorCount })
})

export default router
