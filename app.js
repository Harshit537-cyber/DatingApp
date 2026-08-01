const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const reportRoutes = require("./routes/report.routes");
const planRoutes = require("./routes/plan.routes");
const swipeRoutes = require("./routes/swipe.routes");
const chatRoutes = require("./routes/chat.routes");
const adminRoutes = require("./routes/admin.routes");
const matchRoutes = require("./routes/match.route");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/swipes", swipeRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/matches", matchRoutes);

module.exports = app;