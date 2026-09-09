import { Response, NextFunction } from "express"
import { extractToken, verifyToken } from "../lib/jwt"
import { failure } from "../lib/response"
import type { AuthenticatedRequest } from "../types"

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const token = extractToken(req)
    if (!token) {
      return failure(res, "Unauthorized", 401)
    }

    const user = verifyToken(token)
    if (!user) {
      return failure(res, "Unauthorized", 401)
    }

    req.user = user
    next()
  } catch {
    return failure(res, "Unauthorized", 401)
  }
}

export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req)
    if (token) {
      const user = verifyToken(token)
      if (user) {
        req.user = user
      }
    }
  } catch {
    // Ignore - auth is optional
  }
  next()
}
