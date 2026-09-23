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

// --- New Routes Added ---
const hostRoutes = require("./routes/host.routes");
const ticketRoutes = require("./routes/ticket.routes");

const { handleStripeWebhook } = require("./controllers/plan.controller");

const app = express();

app.use(cors());

app.post(
  "/api/plans/stripe-webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

// Global express.json() parser
app.use(express.json());

// Routes Mounting
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/swipes", swipeRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/circle", circleRoutes);
app.use("/api/notifications", userNotificationRoutes);

// --- Mount Host and Ticket Routes ---
app.use("/api/host", hostRoutes);
app.use("/api/tickets", ticketRoutes);

// Admin Routes
app.use("/api/admin", adminRoutes);
app.use("/api/admin/users-manage", adminRoutes);
app.use("/api/admin/plans-manage", adminPlanRoutes);
app.use("/api/admin/match-manage", adminMatchRoutes);
app.use("/api/admin/notifications", adminNotificationRoutes);

// Chat Routes
app.use("/api/chats", chatRoutes);

// --- Background Cron Jobs (v2 Cleanup & Re-verification) ---
require("./jobs/expirePendingTickets.job");
require("./jobs/flagReVerification.job");

module.exports = app;