require("dotenv").config();
const express = require("express");
const http = require('http');
const { Server } = require("socket.io");
const cors = require("cors");
const passport = require("./config/passport.config");
const routes = require("./routes");
const { scheduleDigestWorker } = require("./workers/digest.worker");
const initializeSocket = require('./socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",").map(s => s.trim()) : "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

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

app.use(cors(corsOptions));

app.use(express.json({ limit: "50mb" }));

app.use(passport.initialize());


app.use("/", routes);

initializeSocket(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Allowed Origins: ${allowedOrigins.join(", ")}`);
  
  // Start the scheduled worker for email digests
  scheduleDigestWorker();
});
