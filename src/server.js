require("dotenv").config();
const express = require("express");
const http = require('http');
const { Server } = require('socket.io');
const cors = require("cors");
const passport = require("./config/passport.config");
const routes = require("./routes");
const { scheduleDigestWorker } = require("./workers/digest.worker");
const { initializeChatSocket } = require("./sockets/chat.socket");

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

// Socket.IO với CORS
const io = new Server(server, {
  cors: "*",
  transports: ['websocket', 'polling'],
});

// Lưu io instance để sử dụng trong controllers
app.set('io', io);

// Khởi tạo chat socket và lưu namespace
const chatNamespace = initializeChatSocket(io);
app.set('chatNamespace', chatNamespace);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use(passport.initialize());

// Serve static files
app.use('/uploads', express.static('uploads'));

app.use("/", routes);


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Socket.IO running on ws://localhost:${PORT}/chat`);
  console.log(`Allowed Origins: ${allowedOrigins.join(", ")}`);

  // Start the scheduled worker for email digests
  scheduleDigestWorker();
});
