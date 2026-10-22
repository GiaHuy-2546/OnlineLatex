import express from 'express';
import cors from 'cors';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const app = express();
const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Cấu hình middleware
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '20mb' }));

// Trang thông tin dịch vụ
app.get('/', (req, res) => {
  res.json({
    service: 'LaTeX Compiler Service',
    engine: 'Tectonic',
    status: 'running',
    endpoints: {
      health: 'GET /health',
      compile: 'POST /compile'
    }
  });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const { stdout } = await execFileAsync('tectonic', ['--version']);
    res.json({
      status: 'healthy',
      tectonic: stdout.trim(),
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(200).json({
      status: 'degraded',
      warning: 'Tectonic CLI chưa được cài đặt trong môi trường này hoặc không tìm thấy trong PATH',
      error: error.message,
      uptime: process.uptime()
    });
  }
});

// Endpoint biên dịch LaTeX sang PDF
app.post('/compile', async (req, res) => {
  const { code } = req.body || {};

  if (!code || typeof code !== 'string') {
    return res.status(400).json({
      error: 'Lỗi biên dịch',
      logs: 'Nội dung mã LaTeX (field "code") không hợp lệ hoặc bị để trống.'
    });
  }

  // Tạo thư mục tạm độc lập bằng os.tmpdir() và crypto.randomUUID()
  const runId = crypto.randomUUID();
  const workDir = path.join(os.tmpdir(), `latex-compile-${runId}`);

  try {
    await fs.mkdir(workDir, { recursive: true });

    // Ghi mã LaTeX vào document.tex
    const texPath = path.join(workDir, 'document.tex');
    await fs.writeFile(texPath, code, 'utf-8');

    let stdout = '';
    let stderr = '';

    try {
      // Thực thi lệnh tectonic với timeout 30 giây
      const result = await execFileAsync('tectonic', ['document.tex'], {
        cwd: workDir,
        timeout: 30000, // 30 seconds max
        maxBuffer: 15 * 1024 * 1024 // 15MB buffer cho logs
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

    // Đọc file document.pdf thu được
    const pdfPath = path.join(workDir, 'document.pdf');
    try {
      const pdfBuffer = await fs.readFile(pdfPath);

      // Trả về dạng binary stream với Header Content-Type: application/pdf
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="document.pdf"');
      res.setHeader('Content-Length', pdfBuffer.length);
      return res.status(200).send(pdfBuffer);
    } catch (readErr) {
      console.error(`[File Read Error ${runId}]:`, readErr);
      return res.status(400).json({
        error: 'Lỗi biên dịch',
        logs: [stdout, stderr, 'Không tìm thấy file document.pdf đầu ra.'].filter(Boolean).join('\n')
      });
    }

  } catch (sysError) {
    console.error(`[System Error ${runId}]:`, sysError);
    return res.status(500).json({
      error: 'Lỗi hệ thống',
      logs: `Không thể khởi tạo hoặc xử lý thư mục tạm: ${sysError.message}`
    });
  } finally {
    // Luôn dọn dẹp thư mục tạm trong khối finally để tránh đầy ổ cứng
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch (cleanError) {
      console.warn(`[Cleanup Warning] Không thể xóa thư mục ${workDir}:`, cleanError.message);
    }
  }
});

// Khởi chạy server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[latex-compiler-service] Đang lắng nghe tại cổng http://0.0.0.0:${PORT}`);
  console.log(`[latex-compiler-service] Môi trường: ${process.env.NODE_ENV || 'development'}`);
});

// Xử lý graceful shutdown
const handleShutdown = (signal) => {
  console.log(`[latex-compiler-service] Nhận tín hiệu ${signal}, đang dừng server...`);
  server.close(() => {
    console.log('[latex-compiler-service] Server đã dừng an toàn.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

