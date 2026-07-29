import jwt from "jsonwebtoken"
import { serialize } from "cookie"
import crypto from "crypto"
import env from "../config/env"
import type { JwtUser } from "../types"

const ACCESS_COOKIE = "auth-token"
const REFRESH_COOKIE = "refresh-token"

export function signAccessToken(user: JwtUser): string {
  return jwt.sign(
    {
      userId: user.userId,
      clerkId: user.clerkId,
      email: user.email,
      isEmployer: user.isEmployer,
      isApplicant: user.isApplicant,
      companyId: user.companyId,
      companyRole: user.companyRole,
    },
    env.jwtSecret,
    { expiresIn: "15m" }
  )
}

export function signRefreshToken(): string {
  return crypto.randomBytes(64).toString("hex")
}

export function verifyToken(token: string): JwtUser | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as JwtUser
    return decoded
  } catch {
    return null
  }
}

export function createAccessCookie(token: string): string {
  return serialize(ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
  })
}

export function clearAccessCookie(): string {
  return serialize(ACCESS_COOKIE, "", {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
}

export function createRefreshCookie(token: string): string {
  return serialize(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  })
}

export function clearRefreshCookie(): string {
  return serialize(REFRESH_COOKIE, "", {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
}

export function extractToken(req: { cookies?: Record<string, string>; headers?: Record<string, string | string[] | undefined> }): string | null {
  const fromCookie = req.cookies?.[ACCESS_COOKIE]
  if (fromCookie) return fromCookie

  const authHeader = req.headers?.authorization as string | undefined
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7)
  }

  return null
}

// Backward-compat aliases
export const signToken = signAccessToken
export const createCookie = createAccessCookie
export const clearCookie = clearAccessCookie
