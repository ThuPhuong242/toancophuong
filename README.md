# Học Toán cùng cô Phương (Fullstack)

- Đăng nhập GV bằng **mã** (ADMIN_PASS).
- Học sinh xem **chỉ dữ liệu của mình**.
- Import/Export CSV lớp học.
- Giao diện vàng–trắng + trang trí toán học.

## Chạy local
```bash
npm install
npm run dev
# http://localhost:3000
```
Cấu hình `.env`:
```
PORT=3000
JWT_SECRET=change-me-please
ADMIN_USER=phuong
ADMIN_PASS=secret123   # đổi thành MÃ GIÁO VIÊN
```

## Deploy Render
- Build: `npm install`
- Start: `node server.js`
- Env vars: như trên. Render sẽ cấp URL public để gửi cho học sinh.

## Docker
```bash
docker build -t math-class .
docker run -p 3000:3000 --env-file .env math-class
```
