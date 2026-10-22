import express from 'express';
import cors from 'cors';
import http from 'http';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { WebSocketServer } from 'ws';

import * as db from './db.js';

const execFileAsync = promisify(execFile);

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const JWT_SECRET = process.env.JWT_SECRET || 'latex-overleaf-clone-secret-key-2024';

// Cấu hình middleware
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '25mb' }));

// Middleware xác thực JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Chưa đăng nhập', message: 'Yêu cầu token xác thực.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
    }
    req.user = user;
    next();
  });
};

// ==============================================================================
// 1. AUTHENTICATION APIS (ĐĂNG NHẬP / ĐĂNG KÝ / GUEST)
// ==============================================================================

// Đăng ký tài khoản mới
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};

    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: 'Email và mật khẩu (tối thiểu 6 ký tự) là bắt buộc.' });
    }

    const existing = await db.findUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'Email này đã được đăng ký tài khoản.' });
    }

    const newUser = await db.createUser({ email, password, name });
    const token = jwt.sign({ id: newUser.id, email: newUser.email, name: newUser.name }, JWT_SECRET, { expiresIn: '30d' });

    // Tạo sẵn 1 dự án mẫu cho người dùng mới
    await db.createProject({
      title: 'Báo Cáo Nghiên Cứu Đầu Tiên',
      ownerId: newUser.id,
      template: 'article'
    });

    res.status(201).json({
      token,
      user: { id: newUser.id, email: newUser.email, name: newUser.name, isGuest: false }
    });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi đăng ký tài khoản', details: error.message });
  }
});

// Đăng nhập
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Vui lòng cung cấp email và mật khẩu.' });
    }

    const user = await db.findUserByEmail(email);
    if (!user) {
      return res.status(400).json({ error: 'Email hoặc mật khẩu không chính xác.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Email hoặc mật khẩu không chính xác.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, isGuest: user.isGuest || false }
    });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi đăng nhập', details: error.message });
  }
});

// Đăng nhập nhanh chế độ Khách (Guest Login) - Không cần email/mật khẩu
app.post('/api/auth/guest', async (req, res) => {
  try {
    const guestUser = await db.createUser({ isGuest: true });
    const token = jwt.sign({ id: guestUser.id, email: guestUser.email, name: guestUser.name, isGuest: true }, JWT_SECRET, { expiresIn: '7d' });

    // Tạo dự án mẫu cho khách
    const project = await db.createProject({
      title: 'Tài Liệu Soạn Thảo (Guest)',
      ownerId: guestUser.id,
      template: 'article'
    });

    res.json({
      token,
      user: { id: guestUser.id, email: guestUser.email, name: guestUser.name, isGuest: true },
      defaultProjectId: project.id
    });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi tạo phiên khách', details: error.message });
  }
});

// Lấy thông tin tài khoản hiện tại
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  const user = await db.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

  res.json({
    user: { id: user.id, email: user.email, name: user.name, isGuest: user.isGuest || false }
  });
});

// ==============================================================================
// 2. PROJECT & FILE MANAGEMENT APIS (QUẢN LÝ DỰ ÁN VÀ CẤU TRÚC FILE)
// ==============================================================================

// Lấy danh sách dự án của user
app.get('/api/projects', authenticateToken, async (req, res) => {
  try {
    const projects = await db.getProjectsForUser(req.user.id);
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi lấy danh sách dự án', details: err.message });
  }
});

// Tạo dự án mới
app.post('/api/projects', authenticateToken, async (req, res) => {
  try {
    const { title, template } = req.body || {};
    const project = await db.createProject({
      title: title || 'Dự án mới',
      ownerId: req.user.id,
      template: template || 'article'
    });
    res.status(201).json({ project });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tạo dự án', details: err.message });
  }
});

// Lấy thông tin chi tiết dự án kèm toàn bộ files
app.get('/api/projects/:id', async (req, res) => {
  try {
    const project = await db.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });

    const files = await db.getFilesForProject(project.id);
    res.json({ project, files });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tải dự án', details: err.message });
  }
});

// Cập nhật tên dự án
app.put('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { title } = req.body || {};
    const updated = await db.updateProject(req.params.id, { title });
    if (!updated) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    res.json({ project: updated });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi cập nhật dự án', details: err.message });
  }
});

// Xóa dự án
app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    await db.deleteProject(req.params.id);
    res.json({ success: true, message: 'Dự án đã được xóa.' });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi xóa dự án', details: err.message });
  }
});

// Tạo tệp tin mới trong dự án
app.post('/api/projects/:id/files', authenticateToken, async (req, res) => {
  try {
    const { name, content } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Tên tệp tin không được để trống' });

    const file = await db.createFile({
      projectId: req.params.id,
      name,
      content: content || ''
    });

    // Thông báo cho tất cả các tab trong phòng qua WebSocket
    broadcastToProject(req.params.id, {
      type: 'file_created',
      file
    });

    res.status(201).json({ file });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tạo tệp tin', details: err.message });
  }
});

// Cập nhật nội dung hoặc đổi tên tệp tin
app.put('/api/projects/:id/files/:fileId', authenticateToken, async (req, res) => {
  try {
    const { name, content } = req.body || {};
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (content !== undefined) updates.content = content;

    const file = await db.updateFile(req.params.fileId, updates);
    if (!file) return res.status(404).json({ error: 'Không tìm thấy file' });

    // Thông báo cho các thành viên khác
    broadcastToProject(req.params.id, {
      type: 'file_updated',
      file,
      senderId: req.user.id
    }, req.user.id);

    res.json({ file });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi cập nhật file', details: err.message });
  }
});

// Xóa tệp tin
app.delete('/api/projects/:id/files/:fileId', authenticateToken, async (req, res) => {
  try {
    await db.deleteFile(req.params.fileId);

    broadcastToProject(req.params.id, {
      type: 'file_deleted',
      fileId: req.params.fileId
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi xóa file', details: err.message });
  }
});

// ==============================================================================
// 3. ENHANCED LATEX COMPILER (HỖ TRỢ BIÊN DỊCH ĐA FILE - OVERLEAF ENGINE)
// ==============================================================================

app.post('/compile', async (req, res) => {
  const { code, mainFile, files } = req.body || {};

  const entryFileName = mainFile || 'document.tex';
  const entryCode = code || (files && files[entryFileName]) || '';

  if (!entryCode || typeof entryCode !== 'string') {
    return res.status(400).json({
      error: 'Lỗi biên dịch',
      logs: 'Nội dung mã LaTeX chính không hợp lệ hoặc bị để trống.'
    });
  }

  const runId = crypto.randomUUID();
  const workDir = path.join(os.tmpdir(), `latex-compile-${runId}`);

  try {
    await fs.mkdir(workDir, { recursive: true });

    // Ghi toàn bộ các files phụ trợ (bib, sub-tex, style,...) vào thư mục biên dịch
    if (files && typeof files === 'object') {
      for (const [fname, fcontent] of Object.entries(files)) {
        if (fname && typeof fcontent === 'string') {
          const safeName = path.normalize(fname).replace(/^(\.\.[\/\\])+/, '');
          const targetPath = path.join(workDir, safeName);
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await fs.writeFile(targetPath, fcontent, 'utf-8');
        }
      }
    }

    // Ghi file chính
    const mainFilePath = path.join(workDir, entryFileName);
    await fs.writeFile(mainFilePath, entryCode, 'utf-8');

    let stdout = '';
    let stderr = '';

    try {
      // Thực thi tectonic biên dịch file chính với timeout 30 giây
      const result = await execFileAsync('tectonic', [entryFileName], {
        cwd: workDir,
        timeout: 30000,
        maxBuffer: 15 * 1024 * 1024
      });
      stdout = result.stdout || '';
      stderr = result.stderr || '';
    } catch (execError) {
      const combinedLogs = [
        execError.stdout,
        execError.stderr,
        execError.killed ? 'Quá thời gian thực thi (Timeout 30s): Tectonic bị hủy do vượt quá thời gian tối đa.' : null,
        execError.message
      ].filter(Boolean).join('\n').trim();

      console.error(`[Compile Error ${runId}]:`, combinedLogs);

      return res.status(400).json({
        error: 'Lỗi biên dịch',
        logs: combinedLogs || 'Đã xảy ra lỗi không xác định trong quá trình biên dịch LaTeX.'
      });
    }

    // Tectonic sinh ra file PDF có cùng tên base với file chính
    const baseName = path.basename(entryFileName, path.extname(entryFileName));
    const pdfPath = path.join(workDir, `${baseName}.pdf`);

    try {
      const pdfBuffer = await fs.readFile(pdfPath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${baseName}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      return res.status(200).send(pdfBuffer);
    } catch (readErr) {
      return res.status(400).json({
        error: 'Lỗi biên dịch',
        logs: [stdout, stderr, 'Không tìm thấy file PDF đầu ra sau khi biên dịch.'].filter(Boolean).join('\n')
      });
    }

  } catch (sysError) {
    return res.status(500).json({
      error: 'Lỗi hệ thống',
      logs: sysError.message
    });
  } finally {
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch {}
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const { stdout } = await execFileAsync('tectonic', ['--version']);
    res.json({
      status: 'healthy',
      tectonic: stdout.trim(),
      activeRooms: projectRooms.size,
      activeClients: wss.clients.size,
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(200).json({
      status: 'degraded',
      warning: 'Tectonic CLI chưa được cài đặt trong môi trường này',
      activeClients: wss.clients.size,
      uptime: process.uptime()
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    service: 'Overleaf Clone - LaTeX Compiler & Realtime Collaboration Backend',
    status: 'running',
    activeClients: wss.clients.size,
    activeRooms: projectRooms.size
  });
});

// ==============================================================================
// 4. SERVER-CENTRIC WEBSOCKET REALTIME COLLABORATION (CHỐNG MẤT KẾT NỐI 100%)
// ==============================================================================

const wss = new WebSocketServer({ noServer: true });

// Map lưu trữ: projectId -> Set of client sockets
const projectRooms = new Map();

// Helper phát tin cho toàn bộ thành viên trong phòng
function broadcastToProject(projectId, payload, excludeUserId = null) {
  const room = projectRooms.get(projectId);
  if (!room) return;

  const raw = JSON.stringify(payload);
  room.forEach((client) => {
    if (client.readyState === 1 && (!excludeUserId || client.userId !== excludeUserId)) {
      client.send(raw);
    }
  });
}

// Helper lấy danh sách người dùng đang online trong phòng
function getRoomPresence(projectId) {
  const room = projectRooms.get(projectId);
  if (!room) return [];

  const userMap = new Map();
  room.forEach((client) => {
    if (client.readyState === 1 && client.userId) {
      userMap.set(client.userId, {
        id: client.userId,
        name: client.userName || 'Thành viên',
        color: client.userColor || '#3b82f6',
        activeFileId: client.activeFileId || null
      });
    }
  });

  return Array.from(userMap.values());
}

wss.on('connection', (ws, req) => {
  // Trích xuất params từ URL: /ws?projectId=...&userId=...&name=...&color=...
  const url = new URL(req.url, 'http://localhost');
  const projectId = url.searchParams.get('projectId') || 'default-room';
  const userId = url.searchParams.get('userId') || `user-${crypto.randomUUID().slice(0, 6)}`;
  const userName = url.searchParams.get('name') || 'Thành viên';
  const userColor = url.searchParams.get('color') || '#3b82f6';

  ws.projectId = projectId;
  ws.userId = userId;
  ws.userName = userName;
  ws.userColor = userColor;
  ws.isAlive = true;

  // Thêm vào phòng
  if (!projectRooms.has(projectId)) {
    projectRooms.set(projectId, new Set());
  }
  projectRooms.get(projectId).add(ws);

  console.log(`[WS] ${userName} (${userId}) đã vào phòng: "${projectId}". Tổng trong phòng: ${projectRooms.get(projectId).size}`);

  // Gửi xác nhận kết nối và danh sách người dùng hiện tại
  ws.send(JSON.stringify({
    type: 'init',
    yourId: userId,
    projectId,
    users: getRoomPresence(projectId)
  }));

  // Báo cho tất cả người trong phòng biết có người mới vào
  broadcastToProject(projectId, {
    type: 'presence',
    users: getRoomPresence(projectId)
  });

  // Xử lý tin nhắn từ client
  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case 'pong':
          ws.isAlive = true;
          break;

        case 'ping':
          ws.isAlive = true;
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        // Đồng bộ thay đổi nội dung văn bản theo thời gian thực
        case 'content_change':
          // Cập nhật ngầm vào database
          if (msg.fileId && typeof msg.content === 'string') {
            db.updateFile(msg.fileId, { content: msg.content }).catch(() => {});
          }

          // Phát lại cho mọi người khác trong phòng
          broadcastToProject(projectId, {
            type: 'content_change',
            fileId: msg.fileId,
            content: msg.content,
            senderId: userId,
            senderName: userName
          }, userId);
          break;

        // Cập nhật vị trí con trỏ
        case 'cursor_move':
          broadcastToProject(projectId, {
            type: 'cursor_move',
            fileId: msg.fileId,
            position: msg.position,
            userId,
            userName,
            userColor
          }, userId);
          break;

        // Báo chuyển đổi tab file đang xem
        case 'switch_file':
          ws.activeFileId = msg.fileId;
          broadcastToProject(projectId, {
            type: 'presence',
            users: getRoomPresence(projectId)
          });
          break;
      }
    } catch (e) {
      // Ignore malformed JSON
    }
  });

  ws.on('close', () => {
    const room = projectRooms.get(projectId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) {
        projectRooms.delete(projectId);
      }
    }

    console.log(`[WS] ${userName} rời phòng "${projectId}". Còn lại: ${room ? room.size : 0}`);

    // Báo cho người còn lại trong phòng
    broadcastToProject(projectId, {
      type: 'presence',
      users: getRoomPresence(projectId)
    });
  });
});

// Heartbeat ping mỗi 15 giây: NGĂN CHẶN TRIỆT ĐỂ RENDER / CLOUD PROXY NGẮT KẾT NỐI
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log(`[WS Heartbeat] Đóng socket chết: ${ws.userName || ws.userId}`);
      return ws.terminate();
    }
    ws.isAlive = false;
    try {
      ws.send(JSON.stringify({ type: 'ping' }));
    } catch {
      ws.terminate();
    }
  });
}, 15000);

wss.on('close', () => clearInterval(heartbeatInterval));

// Xử lý Upgrade WebSocket
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Khởi động Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Overleaf Backend] Đang lắng nghe tại cổng http://0.0.0.0:${PORT}`);
  console.log(`[Overleaf Backend] Sẵn sàng: Authentication, File System, Realtime Sync, Tectonic Compiler.`);
});

const handleShutdown = (signal) => {
  console.log(`[Overleaf Backend] Nhận ${signal}, đang dừng an toàn...`);
  server.close(() => process.exit(0));
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
