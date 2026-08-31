const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const reportRoutes = require("./routes/report.routes");
const planRoutes = require("./routes/plan.routes");
const swipeRoutes = require("./routes/swipe.routes");
const adminRoutes = require("./routes/admin.routes");
const adminPlanRoutes = require("./routes/adminPlan.route");
const adminMatchRoutes = require("./routes/adminMatch.routes"); // <-- Naya Admin Match Route Import kiya
const matchRoutes = require("./routes/match.route");
const circleRoutes = require("./routes/circle.routes");
const adminNotificationRoutes = require("./routes/admin.notification.routes");
const userNotificationRoutes = require("./routes/user.notification.routes");

const app = express();

app.use(cors());
app.use(express.json());

// Routes Mounting
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/swipes", swipeRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/circle", circleRoutes);
app.use("/api/notifications", userNotificationRoutes);

// Admin Routes
app.use("/api/admin", adminRoutes);
app.use("/api/admin/users-manage", adminRoutes); 
app.use("/api/admin/plans-manage", adminPlanRoutes);
app.use("/api/admin/match-manage", adminMatchRoutes); 
app.use("/api/admin/notifications", adminNotificationRoutes);

module.exports = app;