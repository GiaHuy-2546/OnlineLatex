# LaTeX Online Studio - Realtime Collaborative LaTeX Editor & Compiler (Overleaf Clone)

Hệ thống ứng dụng web chỉnh sửa và biên dịch LaTeX thời gian thực hỗ trợ 5–10 người dùng cộng tác chung trong một phòng (Room), bao gồm 2 dịch vụ độc lập:
1. **`latex-compiler-service`**: Microservice backend Node.js đóng gói trong Docker đa tầng (<200MB), tích hợp Tectonic LaTeX Typesetting Engine.
2. **`latex-editor-web`**: Frontend Next.js 14 (App Router) với Monaco Editor, đồng bộ P2P thời gian thực qua Yjs / WebRTC, và trình xem file PDF trực tiếp.

---

## 📁 Cấu trúc thư mục dự án

```text
LatexOnline/
├── docker-compose.yml           # Khởi chạy toàn bộ hệ thống bằng 1 lệnh
├── render.yaml                  # Cấu hình Infrastructure-as-Code cho Render
│
├── latex-compiler-service/      # Backend Microservice biên dịch LaTeX
│   ├── Dockerfile               # Multi-stage build Alpine + Tectonic Engine (<200MB)
│   ├── fly.toml                 # Cấu hình triển khai nhanh lên Fly.io
│   ├── package.json
│   ├── index.js                 # API POST /compile & GET /health
│   └── .env.example
│
└── latex-editor-web/            # Frontend Next.js Studio
    ├── Dockerfile               # Production Dockerfile đa tầng
    ├── next.config.mjs          # Cấu hình Next.js & Webpack alias
    ├── package.json
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── .env.example             # COMPILER_SERVICE_URL
    └── src/
        └── app/
            ├── layout.js        # Root Layout & Metadata
            ├── globals.css      # Tailwind & con trỏ Yjs remote selection
            ├── page.js          # Studio chính (Editor + PDF Viewer + Collab)
            └── api/
                └── compile/     # API Route Handler chuyển tiếp sang Compiler
                    └── route.js
```

---

## 🚀 Hướng dẫn Chạy Nhanh (Local Development)

### Cách 1: Sử dụng Docker Compose (Khuyên dùng)
Khởi chạy cả Backend Compiler Service và Frontend Studio chỉ bằng một câu lệnh:

```bash
docker compose up --build
```

- **Frontend Studio**: Mở trình duyệt tại `http://localhost:3000`
- **Compiler Service**: Chạy tại `http://localhost:5000`

---

### Cách 2: Chạy cục bộ bằng Node.js & Docker độc lập

#### 1. Khởi chạy `latex-compiler-service`:
```bash
cd latex-compiler-service
docker build -t latex-compiler-service .
docker run -p 5000:5000 latex-compiler-service
```
*(Hoặc nếu máy đã cài đặt sẵn Tectonic CLI, bạn có thể chạy: `npm install && npm start`)*

#### 2. Khởi chạy `latex-editor-web`:
```bash
cd latex-editor-web
npm install
npm run dev
```
Mở trình duyệt tại `http://localhost:3000`.

---

## 🌐 Hướng dẫn Triển khai Production

### 1. Triển khai `latex-compiler-service`

#### Cách A: Triển khai lên Render.com (Docker Web Service)
1. Đẩy mã nguồn lên GitHub/GitLab.
2. Truy cập [Render Dashboard](https://dashboard.render.com) -> Chọn **New Web Service**.
3. Kết nối với Repository:
   - **Root Directory**: `latex-compiler-service`
   - **Environment**: `Docker`
   - **Dockerfile Path**: `./Dockerfile`
   - **Instance Type**: Free hoặc Starter
4. Trong phần **Environment Variables**, cấu hình:
   - `PORT`: `5000`
   - `CORS_ORIGIN`: `*` (hoặc tên miền Vercel của bạn)
5. Sao chép URL dịch vụ sau khi deploy xong (ví dụ: `https://latex-compiler-xyz.onrender.com`).

#### Cách B: Triển khai lên Fly.io
```bash
cd latex-compiler-service
fly launch --name my-latex-compiler
fly deploy
```

---

### 2. Triển khai `latex-editor-web` lên Vercel
1. Đẩy mã nguồn lên GitHub/GitLab.
2. Truy cập [Vercel Dashboard](https://vercel.com) -> Chọn **Add New Project**.
3. Chọn thư mục gốc (Root Directory) là `latex-editor-web`.
4. Framework Preset: **Next.js**.
5. Trong mục **Environment Variables**, thêm biến:
   - `COMPILER_SERVICE_URL`: `<URL của Compiler Service trên Render/Fly.io>` (ví dụ: `https://latex-compiler-xyz.onrender.com`)
6. Nhấn **Deploy**.

---

## 🛠️ Tính năng Kỹ thuật Chi tiết

| Thành phần | Công nghệ | Tính năng nổi bật |
| :--- | :--- | :--- |
| **Compiler Service** | Express + Tectonic | • Multi-stage Docker tối ưu kích thước `< 200MB`.<br>• Tự động tải trước (pre-cache) thư viện font và macro TeX.<br>• Cách ly tác vụ biên dịch độc lập bằng `crypto.randomUUID()`.<br>• Tự động dọn dẹp thư mục tạm trong `finally` ngăn tràn đĩa.<br>• Hạn mức thời gian thực thi (timeout) 30s. |
| **Realtime Collab** | Yjs + WebRTC + Awareness | • Kết nối Peer-to-Peer trực tiếp không qua trung gian tập trung.<br>• Đồng bộ hóa từng phím gõ cho 5–10 thành viên.<br>• Hiển thị vị trí con trỏ và tên màu sắc riêng biệt từng người.<br>• Chia sẻ phòng qua URL `?room=ten-phong` tiện lợi. |
| **Code Editor** | Monaco Editor | • Cú pháp `latex` với theme tối `vs-dark`.<br>• Phím tắt biên dịch toàn cục `Ctrl + S` / `Cmd + S`.<br>• Tải mã nguồn `.tex` và xuất bản thảo tức thì. |
| **PDF Viewer & Logs** | HTML5 Blob Viewer | • Xem trước PDF nhúng mượt mà trong trình duyệt.<br>• Tải file PDF biên dịch về máy.<br>• Khung báo lỗi cú pháp LaTeX (Error Log Panel) tự động mở khi có lỗi từ Tectonic. |

