require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const passport = require("./config/passport.config");
const routes = require("./routes");
const { scheduleDigestWorker } = require("./workers/digest.worker");
const { initializeChatSocket } = require("./sockets/chat.socket");
const path = require("path");

const app = express();
const server = http.createServer(app);

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim())
  : ["http://localhost:5173"];


const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn("Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};

app.use(cors("*"));

const io = new Server(server, {
  cors: "*",
  transports: ["websocket", "polling"],
});

app.set("io", io);

initializeChatSocket(io);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use(passport.initialize());

app.use("/", routes);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Socket.IO server running`);
  console.log(`Allowed Origins: ${allowedOrigins.join(", ")}`);

  scheduleDigestWorker();
});
