import env from "../config/env"

export type EmailType =
  | "welcome"
  | "password_reset"
  | "status_update"
  | "new_applicant"
  | "contact"
  | "application_confirmation"

export interface WelcomeData {
  firstName: string
  verificationUrl: string
}

export interface PasswordResetData {
  firstName?: string
  resetUrl: string
}

export interface StatusUpdateData {
  jobTitle: string
  companyName: string
  status: string
  applicationsUrl?: string
}

export interface NewApplicantData {
  jobTitle: string
  candidateName: string
  employerUrl?: string
  candidateEmail?: string
  companyName?: string
  resumeUrl?: string
  applicationUrl?: string
}

export interface ContactData {
  name: string
  email: string
  subject: string
  message: string
  supportEmail?: string
  contactUrl?: string
}

export interface ApplicationConfirmationData {
  jobTitle: string
  companyName: string
  applicationsUrl?: string
}

export interface EmailData {
  welcome: WelcomeData
  password_reset: PasswordResetData
  status_update: StatusUpdateData
  new_applicant: NewApplicantData
  contact: ContactData
  application_confirmation: ApplicationConfirmationData
}

export interface RenderedEmail {
  subject: string
  message: string
  html: string
}

export const EMAIL_LOGO_URL = "https://loft-frontend.onrender.com/email-logo.png"

export class EmailRenderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EmailRenderError"
  }
}

const frontendUrl = env.frontendUrl || "http://localhost:3000"

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new EmailRenderError(`Missing required field "${field}"`)
  }
  return value
}

function assertSafeCta(url: string): void {
  if (!/^(https:\/\/|mailto:)/i.test(url)) {
    throw new EmailRenderError(`Unsafe email CTA URL (must start with https:// or mailto:)`)
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

const escapeBraces = (value: string): string =>
  value.replace(/\{/g, "&#123;").replace(/\}/g, "&#125;")

const escText = (value: string): string => escapeBraces(escapeHtml(value))
const escAttr = (value: string): string =>
  escapeBraces(
    value
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
  )

function h1(text: string): string {
  return `<h1 class="text-body" style="margin:0 0 12px 0; padding:0; font-size:24px; font-weight:700; line-height:30px; color:#1a1a2e;">${escText(text)}</h1>`
}

function h2(text: string): string {
  return `<h2 class="text-body" style="margin:0 0 16px 0; padding:0; font-size:20px; font-weight:600; line-height:26px; color:#1a1a2e;">${escText(text)}</h2>`
}

function body(text: string): string {
  return `<p class="text-body" style="margin:0 0 16px 0; padding:0; font-size:15px; line-height:22px; color:#1a1a2e;">${escText(text)}</p>`
}

function mutedLine(innerHtml: string): string {
  return `<p class="text-muted" style="margin:12px 0 0 0; padding:0; font-size:13px; line-height:20px; color:#6b7280;">${innerHtml}</p>`
}

function link(url: string, text?: string): string {
  return `<a href="${escAttr(url)}" style="color:#4da6ff; text-decoration:underline; font-weight:600;">${escText(text ?? url)}</a>`
}

function ctaButton(text: string, url: string): string {
  assertSafeCta(url)
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0 0 0;">
  <tr>
    <td align="center" class="cta-button" bgcolor="#059669" style="background-color:#059669; border-radius:4px; padding:13px 40px; text-align:center;">
      <a href="${escAttr(url)}" style="display:block; color:#ffffff; font-size:16px; font-weight:600; line-height:22px; white-space:nowrap; text-decoration:none;">${escText(text)}</a>
    </td>
  </tr>
</table>`
}

function detailRow(label: string, value: string): string {
  return `  <tr>
    <td class="text-muted" align="left" style="padding:4px 0; font-size:14px; line-height:20px; color:#6b7280;">${escText(label)}</td>
    <td class="text-body" align="right" style="padding:4px 0; font-size:14px; line-height:20px; color:#1a1a2e;">${escText(value)}</td>
  </tr>`
}

function detailRowHtml(label: string, innerHtml: string): string {
  return `  <tr>
    <td class="text-muted" align="left" style="padding:4px 0; font-size:14px; line-height:20px; color:#6b7280;">${escText(label)}</td>
    <td class="text-body" align="right" style="padding:4px 0; font-size:14px; line-height:20px; color:#1a1a2e;">${innerHtml}</td>
  </tr>`
}

function detailTable(rows: Array<[string, string]>): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0 0 0; width:100%;">
${rows.map(([label, value]) => detailRow(label, value)).join("\n")}
</table>`
}

function signOff(): string {
  return `<p class="text-body" style="margin:24px 0 0 0; padding:0; font-size:14px; line-height:20px; color:#1a1a2e;">&mdash; The LoftCommunity Team</p>`
}

function dividerTable(): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%; margin:24px 0 0 0;">
  <tr>
    <td class="divider" style="padding:0; height:1px; line-height:1px; font-size:1px; border-bottom:1px solid #e5e1dc; mso-line-height-rule:exactly;">&nbsp;</td>
  </tr>
</table>`
}

function footerParagraph(): string {
  return `<p class="text-muted" style="margin:16px 0 0 0; padding:0; font-size:12px; line-height:18px; color:#6b7280;">&copy; ${new Date().getFullYear()} LoftCommunity. All rights reserved.</p>`
}

function renderShell(payload: { subject: string; preheader: string; bodyHtml: string }): string {
  const styles = `@media only screen and (max-width:600px) {
  .container { width:100% !important; padding-left:16px !important; padding-right:16px !important; }
  .email-logo { max-width:220px !important; height:auto !important; }
}
@media (prefers-color-scheme: dark) {
  .email-bg { background-color:#1b161d !important; }
  .content-card { background-color:#1b161d !important; border-color:#3b343f !important; }
  .text-body { color:#fcf7f2 !important; }
  .text-muted { color:#a8a29b !important; }
  .header-bar { background-color:#1b161d !important; }
  .cta-button { background-color:#059669 !important; }
  .cta-button a { color:#ffffff !important; }
  .divider { border-color:#3b343f !important; }
  a { color:#4da6ff !important; }
}
[data-ogsc] {
  .email-bg { background-color:#1b161d !important; }
  .content-card { background-color:#1b161d !important; border-color:#3b343f !important; }
  .text-body { color:#fcf7f2 !important; }
  .text-muted { color:#a8a29b !important; }
  .header-bar { background-color:#1b161d !important; }
  .cta-button { background-color:#059669 !important; }
  .cta-button a { color:#ffffff !important; }
  .divider { border-color:#3b343f !important; }
  a { color:#4da6ff !important; }
}`

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escText(payload.subject)}</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
<style>${styles}</style>
</head>
<body class="email-bg" style="margin:0; padding:0; background-color:#f4f4f7; -webkit-text-size-adjust:100%;">
<!--[if mso]>
<table role="presentation" width="600" align="center" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="padding:0;">
<![endif]-->
<div class="container" style="width:100%; max-width:600px; margin:0 auto; padding:24px 16px; box-sizing:border-box; mso-table-lspace:0; mso-table-rspace:0; font-family:-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
<span class="preheader" style="display:none; visibility:hidden; mso-hide:all; font-size:1px; color:#f4f4f7; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">${escText(payload.preheader)}</span>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
<tr>
<td class="header-bar" bgcolor="#1b161d" style="background-color:#1b161d; border-radius:8px 8px 0 0; padding:24px; text-align:center;">
<a href="${escAttr(frontendUrl)}">
<img class="email-logo" src="${EMAIL_LOGO_URL}" alt="LoftCommunity" width="300" height="192" style="display:block; width:300px; max-width:300px; height:auto; border:0; margin:0 auto;">
</a>
</td>
</tr>
</table>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
<tr>
<td class="content-card" bgcolor="#ffffff" style="background-color:#ffffff; border:1px solid #e5e1dc; border-top:0; border-radius:0 0 8px 8px; padding:32px 24px;">
${payload.bodyHtml}
${dividerTable()}
${footerParagraph()}
</td>
</tr>
</table>
</div>
<!--[if mso]>
</td>
</tr>
</table>
<![endif]-->
</body>
</html>`
}

interface EmailSpec {
  subject: string
  message: string
  preheader: string
  bodyHtml: string
}

function toRendered(spec: EmailSpec): RenderedEmail {
  return {
    subject: spec.subject,
    message: spec.message,
    html: renderShell({ subject: spec.subject, preheader: spec.preheader, bodyHtml: spec.bodyHtml }),
  }
}

function renderWelcome(data: WelcomeData): RenderedEmail {
  const firstName = requireString(data.firstName, "firstName")
  const verificationUrl = requireString(data.verificationUrl, "verificationUrl")
  assertSafeCta(verificationUrl)

  return toRendered({
    subject: "Welcome to LoftCommunity — verify your email",
    message: `Welcome to LoftCommunity, ${firstName}! Your account has been created. Confirm your email by opening this link: ${verificationUrl} (expires in 24 hours).`,
    preheader: `Welcome to LoftCommunity, ${firstName}. Confirm your email to get started.`,
    bodyHtml: [
      h1(`Hi, ${firstName},`),
      h2("Welcome to LoftCommunity"),
      body("Your account has been created. Confirm your email by opening the button below. The verification link expires in 24 hours."),
      ctaButton("Verify your email", verificationUrl),
      mutedLine(`If the button doesn't work, use this link: ${link(verificationUrl)}`),
      signOff(),
    ].join("\n"),
  })
}

function renderPasswordReset(data: PasswordResetData): RenderedEmail {
  const resetUrl = requireString(data.resetUrl, "resetUrl")
  assertSafeCta(resetUrl)
  const firstName = data.firstName?.trim() || "there"

  return toRendered({
    subject: "Reset your LoftCommunity password",
    message: `We received a request to reset your password. Open this link to choose a new one: ${resetUrl} (expires in 1 hour). If you didn't request this, ignore this email.`,
    preheader: "Reset your LoftCommunity password",
    bodyHtml: [
      h1(`Hi, ${firstName},`),
      h2("Reset your LoftCommunity password"),
      body("We received a request to reset your password. Open the button below to choose a new one. The link expires in 1 hour."),
      ctaButton("Reset your password", resetUrl),
      mutedLine(`If the button doesn't work, use this link: ${link(resetUrl)}`),
      mutedLine(escText("If you didn't request this, ignore this email.")),
      signOff(),
    ].join("\n"),
  })
}

function renderStatusUpdate(data: StatusUpdateData): RenderedEmail {
  const jobTitle = requireString(data.jobTitle, "jobTitle")
  const companyName = requireString(data.companyName, "companyName")
  const status = requireString(data.status, "status")
  const applicationsUrl = data.applicationsUrl || `${frontendUrl}/applications`
  assertSafeCta(applicationsUrl)

  return toRendered({
    subject: `Application Status Update - ${jobTitle}`,
    message: `Your application for ${jobTitle} at ${companyName} is now ${status}. Track it: ${applicationsUrl}`,
    preheader: `Your application for ${jobTitle} is now ${status}`,
    bodyHtml: [
      h1("Hi,"),
      h2("Application Status Update"),
      body(`Your application for ${jobTitle} at ${companyName} is now ${status}.`),
      detailTable([
        ["Position", jobTitle],
        ["Company", companyName],
        ["Status", status],
      ]),
      ctaButton("Track your application", applicationsUrl),
      mutedLine(`If the button doesn't work, use this link: ${link(applicationsUrl)}`),
      signOff(),
    ].join("\n"),
  })
}

function renderNewApplicant(data: NewApplicantData): RenderedEmail {
  const jobTitle = requireString(data.jobTitle, "jobTitle")
  const candidateName = requireString(data.candidateName, "candidateName")
  const employerUrl = data.employerUrl || `${frontendUrl}/employer/dashboard`
  assertSafeCta(employerUrl)

  const detailRows: Array<string> = [
    detailRow("Position", jobTitle),
    detailRow("Applicant", candidateName),
  ]
  if (data.companyName) detailRows.push(detailRow("Company", data.companyName))
  if (data.candidateEmail) detailRows.push(detailRow("Contact email", data.candidateEmail))
  if (data.resumeUrl) {
    assertSafeCta(data.resumeUrl)
    detailRows.push(detailRowHtml("Resume", link(data.resumeUrl, "View resume")))
  }

  let cta = ctaButton("Review their profile", employerUrl)
  let fallback = mutedLine(`If the button doesn't work, use this link: ${link(employerUrl)}`)
  if (data.applicationUrl) {
    assertSafeCta(data.applicationUrl)
    cta = ctaButton("Review application", data.applicationUrl)
    fallback = mutedLine(`If the button doesn't work, use this link: ${link(data.applicationUrl)}`)
  }

  return toRendered({
    subject: `New Applicant for ${jobTitle}`,
    message: `${candidateName} has applied for ${jobTitle}. Review their profile: ${employerUrl}`,
    preheader: `${candidateName} has applied for ${jobTitle}`,
    bodyHtml: [
      h1("Hi,"),
      h2("New Applicant"),
      body(`${candidateName} has applied for ${jobTitle}.`),
      `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0 0 0; width:100%;">\n${detailRows.join("\n")}\n</table>`,
      cta,
      fallback,
      signOff(),
    ].join("\n"),
  })
}

function renderApplicationConfirmation(data: ApplicationConfirmationData): RenderedEmail {
  const jobTitle = requireString(data.jobTitle, "jobTitle")
  const companyName = requireString(data.companyName, "companyName")
  const applicationsUrl = data.applicationsUrl || `${frontendUrl}/applications`
  assertSafeCta(applicationsUrl)

  return toRendered({
    subject: `Application Submitted - ${jobTitle}`,
    message: `Your application for ${jobTitle} at ${companyName} has been submitted and will be reviewed. Watch your inbox for status updates. Track it: ${applicationsUrl}`,
    preheader: `Your application for ${jobTitle} at ${companyName} has been submitted`,
    bodyHtml: [
      h1("Hi,"),
      h2("Application Submitted"),
      body(`Your application for ${jobTitle} at ${companyName} has been submitted and will be reviewed. Watch your inbox for status updates.`),
      ctaButton("Track your application", applicationsUrl),
      mutedLine(`If the button doesn't work, use this link: ${link(applicationsUrl)}`),
      signOff(),
    ].join("\n"),
  })
}

function renderContact(data: ContactData): RenderedEmail {
  const name = requireString(data.name, "name")
  const email = requireString(data.email, "email")
  const subject = requireString(data.subject, "subject")
  const message = requireString(data.message, "message")
  const supportEmail = data.supportEmail || env.supportEmail
  const contactUrl = data.contactUrl || `${frontendUrl}/contact`
  assertSafeCta(contactUrl)

  const mailtoUrl = `mailto:${supportEmail}?subject=${encodeURIComponent(`Re: ${subject}`)}`
  assertSafeCta(mailtoUrl)

  return toRendered({
    subject: `[Contact Support] ${subject} - from ${name}`,
    message: `Contact Support Request\n\nFrom: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`,
    preheader: `New contact request from ${name}`,
    bodyHtml: [
      h1("Hello,"),
      h2("New contact request"),
      body(message),
      detailTable([
        ["From", name],
        ["Email", email],
        ["Subject", subject],
      ]),
      ctaButton(`Reply to ${name}`, mailtoUrl),
      mutedLine(`If the button doesn't work, reply directly to: ${link(`mailto:${supportEmail}`)}`),
      mutedLine(`Or use the contact form: ${link(contactUrl)}`),
      signOff(),
    ].join("\n"),
  })
}

export function renderEmail(type: EmailType, data: EmailData[EmailType]): RenderedEmail
export function renderEmail(type: "welcome", data: WelcomeData): RenderedEmail
export function renderEmail(type: "password_reset", data: PasswordResetData): RenderedEmail
export function renderEmail(type: "status_update", data: StatusUpdateData): RenderedEmail
export function renderEmail(type: "new_applicant", data: NewApplicantData): RenderedEmail
export function renderEmail(type: "contact", data: ContactData): RenderedEmail
export function renderEmail(type: "application_confirmation", data: ApplicationConfirmationData): RenderedEmail
export function renderEmail(type: EmailType, data: EmailData[EmailType]): RenderedEmail {
  switch (type) {
    case "welcome":
      return renderWelcome(data as WelcomeData)
    case "password_reset":
      return renderPasswordReset(data as PasswordResetData)
    case "status_update":
      return renderStatusUpdate(data as StatusUpdateData)
    case "new_applicant":
      return renderNewApplicant(data as NewApplicantData)
    case "contact":
      return renderContact(data as ContactData)
    case "application_confirmation":
      return renderApplicationConfirmation(data as ApplicationConfirmationData)
  }
}