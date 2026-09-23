import emailjs from "@emailjs/nodejs"
import { db } from "./db"
import { createLogger } from "./logger"
import env from "../config/env"

const log = createLogger("email")

const emailJsReady = Boolean(env.emailjsPublicKey && env.emailjsServiceId && env.emailjsTemplateId)
if (emailJsReady) {
  emailjs.init({
    publicKey: env.emailjsPublicKey,
    privateKey: env.emailjsPrivateKey || undefined,
  })
}

export async function shouldSendEmail(clerkId: string, type: "applicationUpdates" | "newMessages"): Promise<boolean> {
  try {
    const prefs = await db.notificationPreference.findUnique({
      where: { userId: clerkId },
    })
    if (!prefs) return true
    if (type === "applicationUpdates") return prefs.applicationUpdates
    if (type === "newMessages") return prefs.newMessages
    return true
  } catch {
    return true
  }
}

interface EmailOptions {
  to: string
  subject: string
  message: string
}

export async function sendEmail({ to, subject, message }: EmailOptions) {
  if (!emailJsReady) {
    log.warn("EmailJS not configured, skipping email", { to, subject })
    return { success: false, error: "EmailJS not configured" }
  }

  try {
    const data = await emailjs.send(env.emailjsServiceId, env.emailjsTemplateId, {
      to_email: to,
      from_name: env.emailjsFromName,
      from_email: env.emailjsFromEmail,
      reply_to: env.emailjsFromEmail,
      subject,
      message,
    })
    if (data.status === 200) {
      return { success: true, data }
    }
    return { success: false, error: data }
  } catch (error) {
    log.error("Email error", error)
    return { success: false, error }
  }
}

const baseUrl = env.frontendUrl || "http://localhost:3000"

export const emailTemplates = {
  applicationSubmitted: (jobTitle: string, companyName: string, to: string) => ({
    to,
    subject: `Application Submitted - ${jobTitle}`,
    message: `Your application for ${jobTitle} at ${companyName} has been submitted and will be reviewed. Watch your inbox for status updates. Track it: ${baseUrl}/dashboard/applications`,
  }),

  statusUpdate: (jobTitle: string, companyName: string, status: string, to: string) => ({
    to,
    subject: `Application Status Update - ${jobTitle}`,
    message: `Your application for ${jobTitle} at ${companyName} is now ${status}. Track it: ${baseUrl}/dashboard/applications`,
  }),

  newApplicant: (jobTitle: string, candidateName: string, to: string) => ({
    to,
    subject: `New Applicant for ${jobTitle}`,
    message: `${candidateName} has applied for ${jobTitle}. Review their profile: ${baseUrl}/employer/dashboard`,
  }),

  emailVerification: (to: string, firstName: string, verificationUrl: string) => ({
    to,
    subject: "Welcome to LoftCommunity — verify your email",
    message: `Welcome to LoftCommunity, ${firstName}! Your account has been created. Confirm your email by opening this link: ${verificationUrl} (expires in 24 hours).`,
  }),

  passwordReset: (to: string, resetUrl: string) => ({
    to,
    subject: "Reset your LoftCommunity password",
    message: `We received a request to reset your password. Open this link to choose a new one: ${resetUrl} (expires in 1 hour). If you didn't request this, ignore this email.`,
  }),
}
