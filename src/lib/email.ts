import nodemailer from "nodemailer"
import emailjs from "@emailjs/nodejs"
import { db } from "./db"
import { createLogger } from "./logger"
import env from "../config/env"
import { renderEmail, type EmailData, type EmailType, type EmailRenderError } from "./email-html"

export type { EmailData, EmailType } from "./email-html"
export { EmailRenderError } from "./email-html"

const log = createLogger("email")

const smtpReady = Boolean(env.smtpUser && env.smtpPass)

const transporter = smtpReady
  ? nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: { user: env.smtpUser, pass: env.smtpPass },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    })
  : null

const emailJsReady = !smtpReady && Boolean(env.emailjsPublicKey && env.emailjsServiceId && env.emailjsTemplateId)
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
  html?: string
}

async function send(options: EmailOptions) {
  if (smtpReady && transporter) {
    try {
      const info = await transporter.sendMail({
        from: `${env.mailFromName} <${env.mailFrom}>`,
        to: options.to,
        replyTo: env.mailFrom,
        subject: options.subject,
        text: options.message,
        html: options.html,
      })
      return { success: true, info }
    } catch (error) {
      log.error("SMTP email error", error)
      return { success: false, error }
    }
  }

  if (!emailJsReady) {
    log.warn("Email not configured, skipping email", { to: options.to, subject: options.subject })
    return { success: false, error: "Email not configured" }
  }

  try {
    const data = await emailjs.send(env.emailjsServiceId, env.emailjsTemplateId, {
      to_email: options.to,
      from_name: env.emailjsFromName,
      from_email: env.emailjsFromEmail,
      reply_to: env.emailjsFromEmail,
      subject: options.subject,
      message: options.message,
      ...(options.html ? { html: options.html } : {}),
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

export interface EmailSendInput {
  type: EmailType
  recipient: string
  data: EmailData[EmailType]
}

export async function sendEmail({ type, recipient, data }: EmailSendInput) {
  try {
    const rendered = renderEmail(type, data)
    return await send({
      to: recipient,
      subject: rendered.subject,
      message: rendered.message,
      html: rendered.html,
    })
  } catch (error) {
    log.error("Email render error", error)
    return { success: false, error }
  }
}