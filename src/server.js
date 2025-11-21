require("dotenv").config();
const express = require("express");
const cors = require("cors"); 
const passport = require('./config/passport.config'); // Cấu hình Passport
const routes = require("./routes"); 

// --- KHỞI TẠO APP ---
const app = express(); 

// --- MIDDLEWARE CHUNG ---

// Cấu hình CORS
// Lấy danh sách origins từ biến môi trường (nếu có), nếu không dùng '*'
const allowedOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()) : ['*'];

const corsOptions = {
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    // Tùy chọn: Thêm credentials: true nếu bạn cần gửi cookies/tokens qua CORS
    // credentials: true, 
};

app.use(cors(corsOptions)); 

// Parser cho JSON
app.use(express.json());

// KHỞI TẠO PASSPORT (Cần thiết cho Auth Controller)
app.use(passport.initialize());


// KHAI BÁO CÁC ROUTE
// Sử dụng root path '/' (đã loại bỏ tiền tố /api để giữ sự nhất quán)
app.use('/', routes);


// --- KHỞI ĐỘNG SERVER ---
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (process.env.NODE_ENV === 'development') {
        console.log(`CORS Origins configured: ${allowedOrigins.join(', ')}`);
    }
});