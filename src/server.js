require("dotenv").config();
const express = require("express");
const cors = require("cors"); // Sửa lỗi cors: sử dụng const
const routes = require("./routes"); // Đặt require routes ở đây

// KHỞI TẠO APP
// Dòng này phải đứng trước TẤT CẢ các lệnh app.use()
const app = express(); 

// Import Passport sau khi 'app' được khởi tạo để tránh side-effect
// Tuy nhiên, Passport không nên phụ thuộc vào 'app' khi được require.
// Giữ nguyên vị trí require ở trên để cấu trúc code rõ ràng, 
// nhưng nếu vẫn lỗi, hãy thử di chuyển require('./config/passport.config') xuống đây.

const passport = require('./config/passport.config'); 


// MIDDLEWARE CHUNG

// Cấu hình CORS
let corsOptions = {
    // Tùy chọn: Dùng process.env.CORS_ORIGINS để cấu hình động nếu cần, 
    // hoặc giữ '*' nếu bạn muốn cho phép mọi origin.
    origin: '*', 
}
app.use(cors(corsOptions)); 

// Parser cho JSON
app.use(express.json());

// KHỞI TẠO PASSPORT
app.use(passport.initialize());


// KHAI BÁO CÁC ROUTE
// ⚠️ SỬA: Thay đổi từ "/api" thành "/" để route /auth/google có thể hoạt động
app.use("/", routes);

// --- TIỆN ÍCH: ENDPOINT ĐỂ XÓA CACHE ---
// Đây là một ví dụ về cách bạn có thể thêm một endpoint để xóa cache.
// Bạn cần import instance của keyv mà bạn đang sử dụng trong ứng dụng.
// Giả sử bạn có một file quản lý cache, ví dụ: './config/cache.config.js'
/*
const keyv = require('./config/cache.config'); // Giả sử bạn export keyv instance từ file này

app.post("/api/cache/clear", async (req, res) => {
    // ⚠️ BẢO MẬT: Endpoint này nên được bảo vệ, ví dụ chỉ cho phép admin.
    // Ở đây chúng ta chỉ minh họa chức năng.
    await keyv.clear();
    console.log("Cache đã được xóa thành công!");
    res.status(200).send({ message: "Cache cleared successfully." });
});
*/

// KHỞI ĐỘNG SERVER
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));