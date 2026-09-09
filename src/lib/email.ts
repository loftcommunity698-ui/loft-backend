import { Resend } from "resend"
import { db } from "./db"
import { createLogger } from "./logger"
import env from "../config/env"

const log = createLogger("email")

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null

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
  html: string
}

export async function sendEmail({ to, subject, html }: EmailOptions) {
  if (!resend) {
    log.warn("Resend not configured, skipping email", { to, subject })
    return { success: false, error: "Resend not configured" }
  }

  try {
    const data = await resend.emails.send({
      from: "LoftCommunity <noreply@loftcommunity.com>",
      to,
      subject,
      html,
    })
    return { success: true, data }
  } catch (error) {
    log.error("Email error", error)
    return { success: false, error }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

const baseUrl = env.frontendUrl || "http://localhost:3000"

export const emailTemplates = {
  applicationSubmitted: (jobTitle: string, companyName: string, to: string) => ({
    to,
    subject: `Application Submitted - ${jobTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #10b981;">Application Submitted!</h1>
          <p>Your application for <strong>${escapeHtml(jobTitle)}</strong> at <strong>${escapeHtml(companyName)}</strong> has been submitted successfully.</p>
          <p>Here are the next steps:</p>
          <ol style="line-height: 1.8; color: #333;">
            <li>The employer will review your application and resume.</li>
            <li>Keep your profile and availability up to date — employers check it before reaching out.</li>
            <li>Watch your email and the notification bell for status updates (shortlisted, interviewing, offered).</li>
            <li>If shortlisted, you may be invited to schedule an interview — respond promptly to confirm a time.</li>
            <li>Track your application status anytime in your LoftCommunity dashboard.</li>
          </ol>
          <a href="${baseUrl}/dashboard/applications" 
             style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">
            Track Application
          </a>
          <p style="margin-top: 24px; color: #888; font-size: 12px;">You received this email because you applied for a position on LoftCommunity.</p>
        </body>
      </html>
    `,
  }),

  statusUpdate: (jobTitle: string, companyName: string, status: string, to: string) => ({
    to,
    subject: `Application Status Update - ${jobTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #10b981;">Status Update</h1>
          <p>Your application for <strong>${escapeHtml(jobTitle)}</strong> at <strong>${escapeHtml(companyName)}</strong> is now <strong>${escapeHtml(status)}</strong>.</p>
          <p>Log in to your dashboard to see more details.</p>
          <a href="${baseUrl}/dashboard/applications" 
             style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">
            View Details
          </a>
        </body>
      </html>
    `,
  }),

  newMessage: (senderName: string, to: string) => ({
    to,
    subject: `New Message from ${senderName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #10b981;">New Message</h1>
          <p>You have received a new message from <strong>${escapeHtml(senderName)}</strong>.</p>
          <p>Log in to LoftCommunity to view and respond to the message.</p>
          <a href="${baseUrl}/dashboard/messages" 
             style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">
            View Message
          </a>
        </body>
      </html>
    `,
  }),

  newApplicant: (jobTitle: string, candidateName: string, to: string) => ({
    to,
    subject: `New Applicant for ${jobTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #10b981;">New Applicant</h1>
          <p><strong>${escapeHtml(candidateName)}</strong> has applied for <strong>${escapeHtml(jobTitle)}</strong>.</p>
          <p>Review their profile in your employer dashboard.</p>
          <a href="${baseUrl}/employer/dashboard" 
             style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">
            View Candidates
          </a>
        </body>
      </html>
    `,
  }),
}
