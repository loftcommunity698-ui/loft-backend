import { Router, Request, Response } from "express"
import crypto from "crypto"
import bcrypt from "bcryptjs"
import { db } from "../lib/db"
import { signAccessToken, createAccessCookie, clearAccessCookie, createRefreshCookie, clearRefreshCookie, signRefreshToken } from "../lib/jwt"
import { requireAuth, optionalAuth } from "../middleware/auth"
import { rateLimit } from "../lib/rate-limit"
import {
  registerUser,
  loginUser,
  requestPasswordReset,
  updatePassword,
  validatePassword,
  isPasswordStrongEnough,
  isValidEmail,
} from "../lib/auth-service"
import { createLogger } from "../lib/logger"
import env from "../config/env"
import { failure } from "../lib/response"
import type { AuthenticatedRequest, RegisterInput, LoginInput, OAuthInput } from "../types"

const router = Router()
const log = createLogger("auth")

const REFRESH_TOKEN_DAYS = 7

async function setAuthCookies(userId: string, res: Response): Promise<void> {
  const user = await db.user.findUnique({ where: { id: parseInt(userId) } })
  if (!user) return

  const accessToken = signAccessToken({
    userId: user.id.toString(),
    clerkId: user.clerkId,
    email: user.email,
    isEmployer: user.isEmployer,
    isApplicant: user.isApplicant,
  })

  const refreshToken = signRefreshToken()
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000)

  await db.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.clerkId,
      expiresAt,
    },
  })

  res.setHeader("Set-Cookie", [createAccessCookie(accessToken), createRefreshCookie(refreshToken)])
}

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response) => {
  const ip = req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown"
  const { success } = await rateLimit(`register:${ip}`, 5, 60000)
  if (!success) {
    return failure(res, "Too many requests. Try again later.", 429)
  }

  try {
    const { email, password, firstName, lastName, role: rawRole } = req.body

    if (!email || !password || !firstName || !lastName) {
      return failure(res, "Missing required fields", 400)
    }

    const passwordReq = validatePassword(password)
    if (!isPasswordStrongEnough(passwordReq)) {
      return failure(res, "Password must be at least 8 characters with uppercase and number", 400)
    }

    const input: RegisterInput = {
      email,
      password,
      confirmPassword: password,
      firstName,
      lastName,
      role: (rawRole || "JOB_SEEKER").toLowerCase() === "employer" ? "employer" : "job_seeker",
    }

    const result = await registerUser(input)
    if (!result.success) {
      return failure(res, result.message, 400)
    }

    const verificationToken = crypto.randomBytes(32).toString("hex")
    await db.verificationToken.create({
      data: {
        identifier: email.toLowerCase(),
        token: verificationToken,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    })

    const verificationUrl = `${env.frontendUrl}/verify-email?token=${verificationToken}`

    if (result.user?.clerkId) {
      await db.notification.create({
        data: {
          userId: result.user.clerkId,
          title: "Welcome to Loft Community!",
          message: `Hi ${firstName}! Your account has been created successfully. Start exploring job opportunities and build your career with us.`,
          type: "MESSAGE",
          link: "/dashboard",
        },
      })
    }

    // Generate and set JWT + refresh token cookies
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } })
    if (user) {
      await setAuthCookies(user.id.toString(), res)
    }

    return res.status(201).json({
      success: true,
      message: "User created successfully. Please check your email to verify your account.",
      user: result.user,
      verificationUrl,
    })
  } catch (error) {
    log.error("Register error", error)
    return failure(res, "Internal server error", 500)
  }
})

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  const ip = req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown"
  const { success } = await rateLimit(`login:${ip}`, 5, 60000)
  if (!success) {
    return failure(res, "Too many requests. Try again later.", 429)
  }

  try {
    const { email, password } = req.body
    if (!email || !password) {
      return failure(res, "Email and password are required", 400)
    }

    const result = await loginUser({ email, password } as LoginInput)
    if (!result.success || !result.user) {
      return failure(res, result.message, 401)
    }

    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } })
    if (!user) {
      return failure(res, "Invalid email or password", 401)
    }

    await setAuthCookies(user.id.toString(), res)

    return res.json({
      success: true,
      user: result.user,
    })
  } catch (error) {
    log.error("Login error", error)
    return failure(res, "Internal server error", 500)
  }
})

// POST /api/auth/logout
router.post("/logout", async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.["refresh-token"]
  if (refreshToken) {
    await db.refreshToken.deleteMany({ where: { token: refreshToken } })
  }
  res.setHeader("Set-Cookie", [clearAccessCookie(), clearRefreshCookie()])
  return res.json({ success: true, message: "Logged out successfully" })
})

// POST /api/auth/refresh — rotate refresh token
router.post("/refresh", async (req: Request, res: Response) => {
  const token = req.cookies?.["refresh-token"]
  if (!token) {
    return failure(res, "No refresh token", 401)
  }

  const existing = await db.refreshToken.findUnique({ where: { token } })
  if (!existing || existing.expiresAt < new Date()) {
    if (existing) {
      await db.refreshToken.delete({ where: { id: existing.id } })
    }
    return failure(res, "Invalid or expired refresh token", 401)
  }

  const user = await db.user.findUnique({ where: { clerkId: existing.userId } })
  if (!user) {
    await db.refreshToken.delete({ where: { id: existing.id } })
    return failure(res, "User not found", 401)
  }

  // Rotate: delete old, create new
  await db.refreshToken.delete({ where: { id: existing.id } })

  const accessToken = signAccessToken({
    userId: user.id.toString(),
    clerkId: user.clerkId,
    email: user.email,
    isEmployer: user.isEmployer,
    isApplicant: user.isApplicant,
  })

  const newRefreshToken = signRefreshToken()
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000)

  await db.refreshToken.create({
    data: {
      token: newRefreshToken,
      userId: user.clerkId,
      expiresAt,
    },
  })

  res.setHeader("Set-Cookie", [createAccessCookie(accessToken), createRefreshCookie(newRefreshToken)])

  return res.json({ success: true })
})

// GET /api/auth/me
router.get("/me", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await db.user.findUnique({
      where: { email: req.user!.email },
      select: {
        id: true,
        clerkId: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        profileImage: true,
        isEmployer: true,
        isApplicant: true,
        emailVerified: true,
        tier: true,
        credits: true,
        createdAt: true,
      },
    })

    if (!user) {
      return failure(res, "User not found", 401)
    }

    return res.json({
      user: {
        id: user.clerkId,
        clerkId: user.clerkId,
        email: user.email,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        name: user.name || undefined,
        profileImage: user.profileImage || undefined,
        role: user.isEmployer ? "employer" : "job_seeker",
        isVerified: user.emailVerified === true,
        tier: user.tier,
        credits: user.credits,
        createdAt: user.createdAt,
      },
    })
  } catch (error) {
    log.error("Get current user error", error)
    return failure(res, "Internal server error")
  }
})

// POST /api/auth/oauth - Handle OAuth login (Google/LinkedIn)
// Frontend handles OAuth UI, sends provider + accessToken to this endpoint
router.post("/oauth", async (req: Request, res: Response) => {
  try {
    const { provider, accessToken } = req.body as OAuthInput

    if (!provider || !accessToken) {
      return failure(res, "Provider and access token are required", 400)
    }

    // Verify the OAuth token with the provider
    let email: string | null = null
    let name: string | null = null
    let picture: string | null = null

    if (provider === "google") {
      const response = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${accessToken}`)
      if (!response.ok) {
        const altResponse = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${accessToken}`)
        if (!altResponse.ok) {
          return failure(res, "Invalid Google token", 401)
        }
        const data: any = await altResponse.json()
        email = data.email
        name = data.name
        picture = data.picture
      } else {
        const data: any = await response.json()
        email = data.email
        name = data.name
        picture = data.picture
      }
    } else {
      return failure(res, "Unsupported provider", 400)
    }

    if (!email) {
      return failure(res, "Could not retrieve email from provider", 400)
    }

    // Find or create user
    let user = await db.user.findUnique({ where: { email: email.toLowerCase() } })

    if (!user) {
      const clerkId = `oauth_${provider}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      user = await db.user.create({
        data: {
          clerkId,
          email: email.toLowerCase(),
          name: name || email.split("@")[0],
          profileImage: picture,
          isEmployer: false,
          isApplicant: true,
          emailVerified: true, // OAuth emails are pre-verified
        },
      })
      await db.userProfile.create({ data: { userId: user.clerkId } })
    }

    await setAuthCookies(user.id.toString(), res)

    return res.json({
      success: true,
      user: {
        id: user.clerkId,
        clerkId: user.clerkId,
        email: user.email,
        name: user.name || undefined,
        profileImage: user.profileImage || undefined,
        role: user.isEmployer ? "employer" : "job_seeker",
        isVerified: user.emailVerified === true,
        tier: user.tier,
        credits: user.credits,
        createdAt: user.createdAt,
      },
    })
  } catch (error) {
    log.error("OAuth error", error)
    return failure(res, "Internal server error", 500)
  }
})

// GET /api/auth/verify-email?token=...
router.get("/verify-email", async (req: Request, res: Response) => {
  const token = req.query.token as string

  if (!token) {
    return failure(res, "Token is required", 400)
  }

  const vt = await db.verificationToken.findUnique({ where: { token } })
  if (!vt) {
    return failure(res, "Invalid or expired token", 400)
  }

  if (vt.expires < new Date()) {
    await db.verificationToken.delete({ where: { token } })
    return failure(res, "Token has expired", 400)
  }

  await db.user.update({
    where: { email: vt.identifier },
    data: { emailVerified: true },
  })

  await db.verificationToken.delete({ where: { token } })

  return res.json({ success: true, message: "Email verified successfully" })
})

// POST /api/auth/verify-email - Resend verification email
router.post("/verify-email", async (req: Request, res: Response) => {
  const { email } = req.body
  if (!email) {
    return failure(res, "Email is required", 400)
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user) {
    return failure(res, "User not found", 404)
  }

  if (user.emailVerified) {
    return failure(res, "Email already verified", 400)
  }

  await db.verificationToken.deleteMany({ where: { identifier: email } })

  const token = crypto.randomBytes(32).toString("hex")
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await db.verificationToken.create({
    data: { identifier: email, token, expires },
  })

  const verificationUrl = `${env.frontendUrl}/verify-email?token=${token}`

  // Email delivery is handled client-side via EmailJS; return the URL so the
  // client can send it to the user.
  return res.json({ success: true, message: "Verification email sent", verificationUrl })
})

// POST /api/auth/reset-password
router.post("/reset-password", async (req: Request, res: Response) => {
  const ip = req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown"
  const { success } = await rateLimit(`reset:${ip}`, 3, 60000)
  if (!success) {
    return failure(res, "Too many requests. Try again later.", 429)
  }

  try {
    const { email } = req.body
    if (!email) {
      return failure(res, "Email is required", 400)
    }

    const result = await requestPasswordReset(email)
    if (!result.success) return failure(res, result.message, 400)
    return res.json(result)
  } catch (error) {
    log.error("Reset password error", error)
    return failure(res, "Internal server error", 500)
  }
})

// POST /api/auth/update-password
router.post("/update-password", async (req: Request, res: Response) => {
  try {
    const { token, newPassword, confirmPassword } = req.body

    if (!token || !newPassword || !confirmPassword) {
      return failure(res, "All fields are required", 400)
    }

    const passwordReq = validatePassword(newPassword)
    if (!isPasswordStrongEnough(passwordReq)) {
      return failure(res, "Password does not meet all requirements", 400)
    }

    if (newPassword !== confirmPassword) {
      return failure(res, "Passwords do not match", 400)
    }

    const result = await updatePassword({ token, newPassword, confirmPassword })
    if (!result.success) {
      return failure(res, result.message, 400)
    }

    return res.json(result)
  } catch (error) {
    log.error("Update password error", error)
    return failure(res, "Internal server error", 500)
  }
})

// GET /api/auth/session - Session check for frontend
router.get("/session", optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user) {
      return res.json({ user: { email: req.user.email } })
    }
    return res.json({ user: null })
  } catch {
    return res.json({ user: null })
  }
})

export default router
