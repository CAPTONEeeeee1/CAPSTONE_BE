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
// Loại bỏ tiền tố '/api' theo yêu cầu
app.use('/', routes);


// KHỞI ĐỘNG SERVER
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));