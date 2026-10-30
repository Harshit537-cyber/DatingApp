const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const reportRoutes = require("./routes/report.routes");
const planRoutes = require("./routes/plan.routes");
const swipeRoutes = require("./routes/swipe.routes");
const adminRoutes = require("./routes/admin.routes");
const adminPlanRoutes = require("./routes/adminPlan.route");
const adminMatchRoutes = require("./routes/adminMatch.routes");
const matchRoutes = require("./routes/match.route");
const circleRoutes = require("./routes/circle.routes");
const adminNotificationRoutes = require("./routes/admin.notification.routes");
const userNotificationRoutes = require("./routes/user.notification.routes");
const chatRoutes = require("./routes/chat.routes");

// --- Host and Ticket Routes ---
const hostRoutes = require("./routes/host.routes");
const ticketRoutes = require("./routes/ticket.routes");
const heroRoutes = require("./routes/hero.routes");

const { handleStripeWebhook } = require("./controllers/plan.controller");
const { handleConnectWebhook } = require("./controllers/webhook.controller");

const app = express();

app.use(cors());

// ==========================================
// 1. RAW BODY WEBHOOKS (express.json se pehle aane chahiye)
// ==========================================
// Plan Stripe Webhook
app.post(
  "/api/plans/stripe-webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

// Stripe Connect Webhook
app.post(
  "/api/webhooks/stripe/connect",
  express.raw({ type: "application/json" }),
  handleConnectWebhook
);

// ==========================================
// 2. BODY PARSERS
// ==========================================
app.use(express.json()); // JSON payload parse karne ke liye
app.use(express.urlencoded({ extended: true })); // Meta/Facebook callbacks & Form data parse karne ke liye

// ==========================================
// 3. HEALTH CHECK (Optional but recommended)
// ==========================================
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date() });
});

// ==========================================
// 4. API ROUTES MOUNTING
// ==========================================
// Auth Routes (Login, Register, Facebook Auth yahi se chalenge: /api/auth/facebook)
app.use("/api/auth", authRoutes);


// Core App Routes
app.use("/api/reports", reportRoutes);
app.use("/api/swipes", swipeRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/circle", circleRoutes);
app.use("/api/notifications", userNotificationRoutes);

// Host & Ticket Routes     
// Admin Routes    
app.use("/api/admin", adminRoutes);
app.use("/api/admin/users-manage", adminRoutes);
app.use("/api/admin/plans-manage", adminPlanRoutes);
app.use("/api/admin/match-manage", adminMatchRoutes);
app.use("/api/admin/notifications", adminNotificationRoutes);

app.use("/api/chats", chatRoutes);

// ==========================================
// 5. BACKGROUND CRON JOBS
// ==========================================
require("./jobs/expirePendingTickets.job");
require("./jobs/flagReVerification.job");

module.exports = app;  