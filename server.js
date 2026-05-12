// Import Core Modules and Packages
const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const { Server } = require("socket.io");
const contactRouter = require("./routes/contact.route");

require("dotenv").config();

// Import Custom Modules
const userRouter = require("./routes/user.route");
const verifyToken = require("./middlewares/verifyToken");
const Message = require("./models/Message");

// Github Auth
const session = require("express-session");
const passport = require("passport");
require("./middlewares/passport");
const githubAuthRouter = require("./routes/github.route");

// App and Server Setup
const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 8080;

// Allowed frontend
const FRONTEND_URL = "https://chat-zoom.vercel.app";

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true
  },
});

// Middlewares
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static folders
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "public")));

// Github Auth
app.use(
  session({
    secret: "secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use("/auth", githubAuthRouter);

// Contact API
app.use("/api/contact", contactRouter);

// Image Upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

app.post("/uploads", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    res.json({
      imageUrl: `https://chatzoom.onrender.com/uploads/${req.file.filename}`,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// MongoDB Connection
mongoose
  .connect(process.env.mongoURL)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Connection Failed:", err));

// Routes
app.use("/api/user", userRouter);

// Protected Route
app.get("/profile", verifyToken, (req, res) => {
  res.json({ name: req.user.name });
});

// Socket Logic
let onlineUsers = {};

io.on("connection", (socket) => {
  console.log("🟢 New user connected");

  socket.on("joinRoom", async ({ username, room }) => {
    socket.join(room);
    socket.username = username;
    socket.room = room;

    onlineUsers[socket.id] = username;
    io.emit("userList", onlineUsers);

    socket.to(room).emit("welcome", `${username} joined room: ${room}`);

    try {
      const messages = await Message.find({ room }).sort({ timestamp: 1 });
      socket.emit("loadMessages", messages);
    } catch (err) {
      console.error(err);
    }
  });

  socket.on("gyan", async (msg) => {
    const message = new Message({
      username: socket.username,
      room: socket.room,
      content: msg,
    });

    await message.save();

    io.to(socket.room).emit("chatMessage", {
      username: socket.username,
      content: msg,
      timestamp: message.timestamp,
    });
  });

  socket.on("sendImage", (imageUrl) => {
    io.to(socket.room).emit("receiveImage", {
      username: socket.username,
      imageUrl,
      timestamp: new Date(),
    });
  });

  socket.on("typing", () => {
    socket.to(socket.room).emit("typing", `${socket.username} is typing...`);
  });

  socket.on("stopTyping", () => {
    socket.to(socket.room).emit("stopTyping");
  });

  socket.on("disconnect", () => {
    delete onlineUsers[socket.id];
    io.emit("userList", onlineUsers);
    console.log("🔴 User disconnected");
  });
});

// Start Server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});