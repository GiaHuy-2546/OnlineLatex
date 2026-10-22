# =========================================================
# Multi-stage Dockerfile cho latex-compiler-service
# Dung lượng siêu nhẹ (<200MB), tối ưu cho Render / Fly.io / Docker Local
# =========================================================

# Stage 1: Build Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Minimal Runtime với Tectonic LaTeX Engine
FROM node:20-alpine AS runner
WORKDIR /app

# Cài đặt Tectonic CLI cùng các thư viện font và SSL chứng chỉ
RUN apk add --no-cache \
    tectonic \
    fontconfig \
    ca-certificates \
    curl \
    freetype \
    graphite2 \
    icu-libs \
    harfbuzz \
    libpng \
    zlib

# Tải trước (pre-cache) các gói cơ bản của Tectonic vào cache để biên dịch lần đầu siêu tốc
# Sử dụng cú pháp tương thích POSIX /bin/sh (Alpine Linux không dùng Bash)
RUN mkdir -p /root/.cache/Tectonic /tmp/init && \
    printf '%s\n' '\documentclass{article}\begin{document}Ready\end{document}' > /tmp/init/init.tex && \
    (cd /tmp/init && tectonic init.tex > /dev/null 2>&1 || true) && \
    rm -rf /tmp/init

ENV NODE_ENV=production
ENV PORT=5000

COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY index.js db.js ./

EXPOSE 5000

# Khởi chạy Compiler Server
CMD ["node", "index.js"]
