import { Router } from "express"
import env from "../config/env"
import { getEmailDebugLog } from "../lib/email"

const router = Router()

router.get("/email-log", (req, res) => {
  if (!env.debugKey || req.headers["x-debug-key"] !== env.debugKey) {
    return res.status(403).json({ error: "invalid debug key" })
  }
  res.json({ entries: getEmailDebugLog() })
})

export default router