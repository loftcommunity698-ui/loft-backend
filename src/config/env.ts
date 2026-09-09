const env = {
  port: parseInt(process.env.PORT || "4000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  isDev: (process.env.NODE_ENV || "development") === "development",
  databaseUrl: process.env.DATABASE_URL || "",
  jwtSecret: process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? (() => { throw new Error("JWT_SECRET must be set in production") })() : "dev-secret-change-in-production"),
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  resendApiKey: process.env.RESEND_API_KEY || "",
  supportEmail: process.env.SUPPORT_EMAIL || "support@loftcommunity.com",
  stripeSecret: process.env.STRIPE_SECRET || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  adminEmails: (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim()).filter(Boolean),
  keepaliveEnabled: process.env.KEEPALIVE_ENABLED === "true",
  keepaliveUrl: process.env.KEEPALIVE_URL || "",
  keepaliveIntervalMin: Math.max(parseInt(process.env.KEEPALIVE_INTERVAL_MIN || "10", 10), 1),
}

export default env
