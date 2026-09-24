import { describe, it, expect } from "vitest"
import { renderEmail, EmailRenderError, EMAIL_LOGO_URL } from "../lib/email-html"

const HTTPS = "https://loft-frontend.onrender.com"

const verificationUrl = `${HTTPS}/verify-email?token=0e25f4eaf3f74b2c8d3a91c6f0a4b7d2`
const resetUrl = `${HTTPS}/forgot-password?token=8f9c1b2a3d4e5f60718293a4b5c6d7e8`
const applicationsUrl = `${HTTPS}/applications`
const employerUrl = `${HTTPS}/employer/dashboard`
const contactUrl = `${HTTPS}/contact`

function sharedHtmlAssertions(html: string): void {
  expect(html.length).toBeLessThan(102 * 1024)
  expect(html).toMatch(/<!DOCTYPE html>/i)
  expect(html).toMatch(/<meta name="color-scheme" content="light dark">/)
  expect(html).toMatch(/<meta name="supported-color-schemes" content="light dark">/)
  expect(html).toMatch(/<style>[\s\S]*@media only screen and \(max-width:600px\)[\s\S]*<\/style>/)
  expect(html).toMatch(/@media \(prefers-color-scheme: dark\)/)
  expect(html).toMatch(/\[data-ogsc\]/)
  expect(html).toMatch(/<img class="email-logo"/)
  expect(html).toMatch(/alt="LoftCommunity"/)
  expect(html).toMatch(/width="300"/)
  expect(html).toMatch(/height="192"/)
  expect(html).toContain(EMAIL_LOGO_URL)
  expect(html).toMatch(/class="header-bar"[^>]*bgcolor="#1b161d"[^>]*background-color:#1b161d/)
  expect(html).toMatch(/class="cta-button"[^>]*bgcolor="#059669"/)
  expect(html).toMatch(/#059669/)
  expect(html).toMatch(/padding:13px 40px/)
  expect(html).toMatch(/<table role="presentation"/)
  expect(html).toMatch(/role="presentation"/)
  expect(html).not.toMatch(/display:\s*(flex|grid)/i)
  expect(html).not.toMatch(/\{\{/)
  expect(html).not.toMatch(/\}\}/)
  expect(html).not.toMatch(/var\(/)
}

describe("renderEmail", () => {
  it("renders welcome with verification CTA and preserved plain text", () => {
    const rendered = renderEmail("welcome", { firstName: "Ada", verificationUrl })
    expect(rendered.subject).toBe("Welcome to LoftCommunity — verify your email")
    expect(rendered.message).toBe(
      `Welcome to LoftCommunity, Ada! Your account has been created. Confirm your email by opening this link: ${verificationUrl} (expires in 24 hours).`
    )
    const { html } = rendered
    sharedHtmlAssertions(html)
    expect(html).toMatch(/href="https:\/\/loft-frontend\.onrender\.com\/verify-email/)
    expect(html).toContain(verificationUrl)
    expect(html).toMatch(/Verify your email/)
    expect(html).toMatch(/Hi, Ada,/)
    expect(html).toMatch(/expires in 24 hours/)
  })

  it("renders password_reset with reset CTA and fallback link", () => {
    const rendered = renderEmail("password_reset", { firstName: "Bob", resetUrl })
    expect(rendered.subject).toBe("Reset your LoftCommunity password")
    expect(rendered.message).toBe(
      `We received a request to reset your password. Open this link to choose a new one: ${resetUrl} (expires in 1 hour). If you didn't request this, ignore this email.`
    )
    const { html } = rendered
    sharedHtmlAssertions(html)
    expect(html).toMatch(/href="https:\/\/loft-frontend\.onrender\.com\/forgot-password/)
    expect(html).toMatch(/Reset your password/)
    expect(html).toMatch(/Hi, Bob,/)
  })

  it("renders status_update pointing at /applications", () => {
    const rendered = renderEmail("status_update", {
      jobTitle: "Senior Product Engineer",
      companyName: "Acme Inc",
      status: "interview",
      applicationsUrl,
    })
    expect(rendered.subject).toBe("Application Status Update - Senior Product Engineer")
    expect(rendered.message).toBe(
      `Your application for Senior Product Engineer at Acme Inc is now interview. Track it: ${applicationsUrl}`
    )
    const { html } = rendered
    sharedHtmlAssertions(html)
    expect(html).toMatch(/href="https:\/\/loft-frontend\.onrender\.com\/applications"/)
    expect(html).toContain("Senior Product Engineer")
    expect(html).toContain("Acme Inc")
    expect(html).toContain("interview")
    expect(html).toMatch(/Track your application/)
  })

  it("renders new_applicant with employer dashboard CTA", () => {
    const rendered = renderEmail("new_applicant", {
      jobTitle: "Senior Product Engineer",
      candidateName: "Jane Doe",
      employerUrl,
    })
    expect(rendered.subject).toBe("New Applicant for Senior Product Engineer")
    expect(rendered.message).toBe(
      `Jane Doe has applied for Senior Product Engineer. Review their profile: ${employerUrl}`
    )
    const { html } = rendered
    sharedHtmlAssertions(html)
    expect(html).toMatch(/href="https:\/\/loft-frontend\.onrender\.com\/employer\/dashboard"/)
    expect(html).toMatch(/Review their profile/)
    expect(html).toContain("Jane Doe")
  })

  it("renders application_confirmation pointing at /applications", () => {
    const rendered = renderEmail("application_confirmation", {
      jobTitle: "Senior Product Engineer",
      companyName: "Acme Inc",
      applicationsUrl,
    })
    expect(rendered.subject).toBe("Application Submitted - Senior Product Engineer")
    expect(rendered.message).toBe(
      `Your application for Senior Product Engineer at Acme Inc has been submitted and will be reviewed. Watch your inbox for status updates. Track it: ${applicationsUrl}`
    )
    const { html } = rendered
    sharedHtmlAssertions(html)
    expect(html).toMatch(/href="https:\/\/loft-frontend\.onrender\.com\/applications"/)
    expect(html).toMatch(/Application Submitted/)
  })

  it("renders contact with mailto CTA and https contact link", () => {
    const rendered = renderEmail("contact", {
      name: "Jane Doe",
      email: "jane@example.com",
      subject: "Billing question",
      message: "Hi team, how do I update my payment method?",
      supportEmail: "support@loftcommunity.com",
      contactUrl,
    })
    expect(rendered.subject).toBe("[Contact Support] Billing question - from Jane Doe")
    expect(rendered.message).toBe(
      `Contact Support Request\n\nFrom: Jane Doe\nEmail: jane@example.com\nSubject: Billing question\n\nHi team, how do I update my payment method?`
    )
    const { html } = rendered
    sharedHtmlAssertions(html)
    expect(html).toMatch(/href="mailto:support@loftcommunity\.com/)
    expect(html).toMatch(/href="https:\/\/loft-frontend\.onrender\.com\/contact"/)
    expect(html).toContain("Billing question")
    expect(html).toContain("jane@example.com")
  })

  it("escapes HTML and braces in user data with zero literal braces in output", () => {
    const rendered = renderEmail("welcome", { firstName: `<b>{hi}</b>&"'`, verificationUrl })
    expect(rendered.html).toContain("&#123;")
    expect(rendered.html).toContain("&#125;")
    expect(rendered.html).toContain("&lt;b&gt;")
    expect(rendered.html).toContain("&quot;")
    expect(rendered.html).not.toMatch(/<b>/)
    expect(rendered.message).toContain(`<b>{hi}</b>&"'`)
  })

  it("throws a typed error when a required field is missing", () => {
    expect(() => renderEmail("welcome", { firstName: "", verificationUrl })).toThrow(EmailRenderError)
    expect(() => renderEmail("welcome", { firstName: "Ada", verificationUrl: "" })).toThrow(EmailRenderError)
    expect(() => renderEmail("password_reset", { firstName: "Ada", resetUrl: "" })).toThrow(EmailRenderError)
    expect(() => renderEmail("status_update", { jobTitle: "", companyName: "Acme", status: "interview", applicationsUrl })).toThrow(EmailRenderError)
    expect(() => renderEmail("contact", { name: "Ada", email: "", subject: "Hi", message: "Hello" })).toThrow(EmailRenderError)
  })

  it("rejects unsafe CTA schemes with a typed error", () => {
    expect(() => renderEmail("welcome", { firstName: "Ada", verificationUrl: "http://evil.test/verify" })).toThrow(EmailRenderError)
    expect(() => renderEmail("welcome", { firstName: "Ada", verificationUrl: "javascript:alert(1)" })).toThrow(EmailRenderError)
    expect(() => renderEmail("status_update", { jobTitle: "x", companyName: "y", status: "z", applicationsUrl: "http://localhost:3000/applications" })).toThrow(EmailRenderError)
  })
})