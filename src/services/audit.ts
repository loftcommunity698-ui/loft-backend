import { Prisma } from "@prisma/client"
import { db } from "../lib/db"

interface AuditEventInput {
  actorId?: string
  action: string
  resource: string
  resourceId?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
}

class AuditService {
  async logEvent(input: AuditEventInput): Promise<void> {
    try {
      await db.auditEvent.create({
        data: {
          actorId: input.actorId ?? null,
          action: input.action,
          resource: input.resource,
          resourceId: input.resourceId ?? null,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
          ipAddress: input.ipAddress ?? null,
        },
      })
    } catch (error) {
      console.error("[Audit] Failed to log event:", error)
    }
  }

  async query(params: {
    actorId?: string
    action?: string
    resource?: string
    resourceId?: string
    from?: string
    to?: string
    cursor?: string
    take?: number
  }): Promise<{ events: any[]; total: number; cursor: string | null }> {
    const take = Math.min(params.take ?? 50, 100)

    const where: any = {}
    if (params.actorId) where.actorId = params.actorId
    if (params.action) where.action = params.action
    if (params.resource) where.resource = params.resource
    if (params.resourceId) where.resourceId = params.resourceId
    if (params.from || params.to) {
      where.createdAt = {}
      if (params.from) where.createdAt.gte = new Date(params.from)
      if (params.to) where.createdAt.lte = new Date(params.to)
    }

    const [events, total] = await Promise.all([
      db.auditEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: take + 1,
        ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      }),
      db.auditEvent.count({ where }),
    ])

    const hasMore = events.length > take
    const cursor = hasMore ? events[events.length - 1].id : null

    return { events: events.slice(0, take), total, cursor }
  }
}

export const auditService = new AuditService()
