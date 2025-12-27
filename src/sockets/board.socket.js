const { verifyAccess } = require("../utils/jwt");

function initializeBoardSocket(io) {
  const boardNamespace = io.of("/board");

  boardNamespace.use(async (socket, next) => {
    try {
      let token =
        socket.handshake.auth.token || socket.handshake.headers.authorization;

      if (!token) {
        return next(new Error("Thiếu token xác thực"));
      }

      if (token.startsWith("Bearer ")) {
        token = token.slice(7);
      }

      const decoded = verifyAccess(token);
      socket.userId = decoded.sub;
      next();
    } catch (error) {
      console.error("Lỗi xác thực Socket.IO cho board:", error.name, error.message);
      return next(new Error("Lỗi xác thực"));
    }
  });

  boardNamespace.on("connection", (socket) => {
    console.log(`User ${socket.userId} đã kết nối tới board socket`);

    socket.on("join_board", (boardId) => {
      socket.join(`board:${boardId}`);
      console.log(`User ${socket.userId} đã tham gia board ${boardId}`);
    });

    socket.on("leave_board", (boardId) => {
      socket.leave(`board:${boardId}`);
      console.log(`User ${socket.userId} đã rời board ${boardId}`);
    });

    socket.on("disconnect", () => {
      console.log(`User ${socket.userId} đã ngắt kết nối board socket`);
    });
  });

  return boardNamespace;
}

module.exports = { initializeBoardSocket };
