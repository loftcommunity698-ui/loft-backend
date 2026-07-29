import type { Response, NextFunction } from "express"
import { db } from "../lib/db"
import type { AuthenticatedRequest } from "../types"

async function evaluatePermission(userId: string, action: string): Promise<{ decision: "ALLOW" | "DENY"; reason: string; roleId?: string }> {
  const bindings = await db.roleBinding.findMany({
    where: {
      userId,
      status: "active",
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    include: { role: true },
  })

  if (bindings.length === 0) {
    return { decision: "DENY", reason: "NO_BINDINGS" }
  }

  for (const binding of bindings) {
    const capabilities = binding.role.capabilities as string[]

    if (capabilities.includes("*:*")) {
      return { decision: "ALLOW", reason: "WILDCARD", roleId: binding.roleId }
    }

    if (capabilities.includes(action)) {
      return { decision: "ALLOW", reason: "EXACT_MATCH", roleId: binding.roleId }
    }

    const [resource] = action.split(":")
    if (capabilities.includes(`${resource}:*`)) {
      return { decision: "ALLOW", reason: "WILDCARD_ACTION", roleId: binding.roleId }
    }
  }

  return { decision: "DENY", reason: "NO_MATCHING_CAPABILITY" }
}

export function requirePermission(action: string) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return _res.status(401).json({ error: "Authentication required" })
    }

    const result = await evaluatePermission(req.user.clerkId, action)

    if (result.decision === "DENY") {
      return _res.status(403).json({ error: `Insufficient permissions: ${result.reason}` })
    }

    next()
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return _res.status(401).json({ error: "Authentication required" })
    }

    const userRole = req.user.isEmployer ? "employer" : "seeker"
    if (!roles.includes(userRole)) {
      return _res.status(403).json({ error: "Insufficient role" })
    }

    next()
  }
}
