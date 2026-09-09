import type { Response, NextFunction } from "express"
import { db } from "../lib/db"
import { failure } from "../lib/response"
import type { AuthenticatedRequest } from "../types"
import env from "../config/env"

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
      return failure(_res, "Authentication required", 401)
    }

    const result = await evaluatePermission(req.user.clerkId, action)

    if (result.decision === "DENY") {
      return failure(_res, `Insufficient permissions: ${result.reason}`, 403)
    }

    next()
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return failure(_res, "Authentication required", 401)
    }

    const userRole = req.user.isEmployer ? "employer" : "seeker"
    if (!roles.includes(userRole)) {
      return failure(_res, "Insufficient role", 403)
    }

    next()
  }
}

export async function requireAdmin(req: AuthenticatedRequest, res: Response): Promise<boolean> {
  try {
    const userEmail = req.user!.email

    if (env.adminEmails.includes(userEmail)) return true

    const user = await db.user.findUnique({
      where: { email: userEmail },
      include: { companyMemberships: { where: { role: "ADMIN" }, take: 1 } },
    })
    if (!user?.companyMemberships?.length) {
      failure(res, "Unauthorized", 403)
      return false
    }
    return true
  } catch {
    failure(res, "Unauthorized", 403)
    return false
  }
}
