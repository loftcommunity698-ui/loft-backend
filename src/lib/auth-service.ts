import bcrypt from "bcryptjs"
import crypto from "crypto"
import { db } from "./db"
import { createLogger } from "./logger"
import { sendEmail, emailTemplates } from "./email"
import env from "../config/env"
import type {
  AuthUser,
  AuthResponse,
  RegisterInput,
  LoginInput,
  UpdatePasswordInput,
  PasswordRequirements,
} from "../types"

const log = createLogger("authService")

export function validatePassword(password: string): PasswordRequirements {
  return {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  }
}

export function isPasswordStrongEnough(requirements: PasswordRequirements): boolean {
  return Object.values(requirements).every(Boolean)
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

function toAuthUser(dbUser: {
  id: number
  clerkId: string
  email: string
  name: string | null
  firstName: string | null
  lastName: string | null
  profileImage: string | null
  isEmployer: boolean
  emailVerified: boolean | null
  tier: string
  credits: string
  createdAt: Date
}): AuthUser {
  return {
    id: dbUser.clerkId,
    clerkId: dbUser.clerkId,
    email: dbUser.email,
    firstName: dbUser.firstName || undefined,
    lastName: dbUser.lastName || undefined,
    name: dbUser.name || undefined,
    profileImage: dbUser.profileImage || undefined,
    role: dbUser.isEmployer ? "employer" : "job_seeker",
    isVerified: dbUser.emailVerified === true,
    tier: dbUser.tier,
    credits: dbUser.credits,
    createdAt: dbUser.createdAt,
  }
}

export async function registerUser(input: RegisterInput): Promise<AuthResponse> {
  if (!isValidEmail(input.email)) {
    return { success: false, message: "Please enter a valid email address" }
  }

  const passwordRequirements = validatePassword(input.password)
  if (!isPasswordStrongEnough(passwordRequirements)) {
    return { success: false, message: "Password does not meet all requirements" }
  }

  if (input.password !== input.confirmPassword) {
    return { success: false, message: "Passwords do not match" }
  }

  const existing = await db.user.findUnique({ where: { email: input.email.toLowerCase() } })
  if (existing) {
    return { success: false, message: "An account with this email already exists" }
  }

  const hashedPassword = await bcrypt.hash(input.password, 12)
  const clerkId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

  const user = await db.user.create({
    data: {
      clerkId,
      email: input.email.toLowerCase(),
      firstName: input.firstName,
      lastName: input.lastName,
      name: `${input.firstName} ${input.lastName}`,
      hashedPassword,
      isEmployer: input.role === "employer",
      isApplicant: input.role === "job_seeker",
    },
  })

  if (input.role === "job_seeker") {
    await db.userProfile.create({ data: { userId: clerkId } })
  }

  const authUser = toAuthUser(user)
  return {
    success: true,
    message: "Registration successful. Please verify your email.",
    user: authUser,
  }
}

export async function loginUser(input: LoginInput): Promise<AuthResponse> {
  if (!isValidEmail(input.email)) {
    return { success: false, message: "Please enter a valid email address" }
  }

  const user = await db.user.findUnique({ where: { email: input.email.toLowerCase() } })
  if (!user || !user.hashedPassword) {
    return { success: false, message: "Invalid email or password" }
  }

  const valid = await bcrypt.compare(input.password, user.hashedPassword)
  if (!valid) {
    return { success: false, message: "Invalid email or password" }
  }

  const authUser = toAuthUser(user)
  return {
    success: true,
    message: "Login successful",
    user: authUser,
  }
}

export async function requestPasswordReset(email: string): Promise<AuthResponse> {
  if (!isValidEmail(email)) {
    return { success: false, message: "Please enter a valid email address" }
  }

  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } })
  if (!user) {
    return {
      success: true,
      message: "If an account exists, a password reset link has been sent",
    }
  }

  const token = crypto.randomBytes(32).toString("hex")
  await db.verificationToken.deleteMany({
    where: { identifier: email.toLowerCase() },
  })
  await db.verificationToken.create({
    data: {
      identifier: email.toLowerCase(),
      token,
      expires: new Date(Date.now() + 60 * 60 * 1000),
    },
  })

  log.info("Password reset token generated", { email })

  const resetUrl = `${env.frontendUrl}/forgot-password?token=${token}`

  try {
    const emailResult = await sendEmail(emailTemplates.passwordReset(email.toLowerCase(), resetUrl))
    if (!emailResult.success) {
      log.error("Failed to send password reset email", { email })
    }
  } catch (error) {
    log.error("Failed to send password reset email", error)
  }

  return {
    success: true,
    message: "If an account exists, a password reset link has been sent",
  }
}

export async function updatePassword(input: UpdatePasswordInput): Promise<AuthResponse> {
  const passwordRequirements = validatePassword(input.newPassword)
  if (!isPasswordStrongEnough(passwordRequirements)) {
    return { success: false, message: "Password does not meet all requirements" }
  }

  if (input.newPassword !== input.confirmPassword) {
    return { success: false, message: "Passwords do not match" }
  }

  const tokenRecord = await db.verificationToken.findUnique({
    where: { token: input.token },
  })
  if (!tokenRecord || tokenRecord.expires < new Date()) {
    if (tokenRecord) {
      await db.verificationToken.delete({ where: { token: input.token } })
    }
    return { success: false, message: "Invalid or expired reset token" }
  }

  const hashedPassword = await bcrypt.hash(input.newPassword, 12)
  await db.user.update({
    where: { email: tokenRecord.identifier },
    data: { hashedPassword },
  })
  await db.verificationToken.delete({ where: { token: input.token } })

  return { success: true, message: "Password updated successfully" }
}
