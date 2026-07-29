import { describe, it, expect, vi, beforeAll } from "vitest"

vi.mock("../lib/db", () => ({
  db: {
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  },
}))

import request from "supertest"
import app from "../app"

describe("GET /api/health", () => {
  it("returns status ok with db connected and uptime", async () => {
    const res = await request(app).get("/api/health")

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("status", "ok")
    expect(res.body).toHaveProperty("db", "connected")
    expect(res.body).toHaveProperty("uptime")
    expect(res.body).toHaveProperty("timestamp")
    expect(typeof res.body.uptime).toBe("number")
    expect(typeof res.body.timestamp).toBe("string")
  })

  it("returns 503 when database is down", async () => {
    const { db } = await import("../lib/db")
    ;(db.$queryRaw as any).mockRejectedValueOnce(new Error("DB connection failed"))

    const res = await request(app).get("/api/health")

    expect(res.status).toBe(503)
    expect(res.body).toHaveProperty("status", "error")
    expect(res.body).toHaveProperty("db", "disconnected")
    expect(res.body).toHaveProperty("timestamp")
  })
})
