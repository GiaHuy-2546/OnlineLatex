import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const FILES_FILE = path.join(DATA_DIR, 'files.json');

// Khởi tạo thư mục và các file dữ liệu nếu chưa có
async function initDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const initFile = async (filePath, defaultData) => {
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
    }
  };

  await initFile(USERS_FILE, []);
  await initFile(PROJECTS_FILE, []);
  await initFile(FILES_FILE, []);

  // Tạo tài khoản Demo mặc định nếu database trống
  const users = await readJson(USERS_FILE);
  if (users.length === 0) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('123456', salt);
    const demoUser = {
      id: 'user-demo',
      email: 'demo@latex.online',
      passwordHash: hash,
      name: 'Nguyễn Văn Demo',
      createdAt: new Date().toISOString()
    };
    users.push(demoUser);
    await writeJson(USERS_FILE, users);

    // Tạo dự án mẫu cho demo user
    await createProject({
      title: 'Báo Cáo Nghiên Cứu Mẫu (Overleaf)',
      ownerId: demoUser.id,
      template: 'article'
    });
  }
}

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ================= USER OPERATIONS =================

export async function findUserByEmail(email) {
  const users = await readJson(USERS_FILE);
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
}

export async function findUserById(id) {
  const users = await readJson(USERS_FILE);
  return users.find((u) => u.id === id) || null;
}

export async function createUser({ email, password, name, isGuest = false }) {
  const users = await readJson(USERS_FILE);
  const id = `user-${crypto.randomUUID().slice(0, 8)}`;
  
  let passwordHash = '';
  if (password) {
    const salt = await bcrypt.genSalt(10);
    passwordHash = await bcrypt.hash(password, salt);
  }

  const newUser = {
    id,
    email: email || `guest-${id}@latex.online`,
    passwordHash,
    name: name || (isGuest ? `Khách #${id.slice(-4)}` : 'Thành viên'),
    isGuest,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  await writeJson(USERS_FILE, users);
  return newUser;
}

// ================= PROJECT OPERATIONS =================

export async function getProjectsForUser(userId) {
  const projects = await readJson(PROJECTS_FILE);
  return projects.filter(
    (p) => p.ownerId === userId || (p.collaborators && p.collaborators.includes(userId))
  ).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function getProject(projectId) {
  const projects = await readJson(PROJECTS_FILE);
  return projects.find((p) => p.id === projectId) || null;
}

export async function createProject({ title, ownerId, template = 'article' }) {
  const projects = await readJson(PROJECTS_FILE);
  const projectId = `proj-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  const newProject = {
    id: projectId,
    title: title || 'Dự án LaTeX mới',
    ownerId,
    collaborators: [],
    createdAt: now,
    updatedAt: now,
    activeFile: 'main.tex'
  };

  projects.push(newProject);
  await writeJson(PROJECTS_FILE, projects);

  // Tạo file ban đầu tùy theo template
  if (template === 'article') {
    await createFile({
      projectId,
      name: 'main.tex',
      content: DEFAULT_ARTICLE_TEMPLATE
    });
    await createFile({
      projectId,
      name: 'references.bib',
      content: DEFAULT_BIB_TEMPLATE
    });
  } else if (template === 'beamer') {
    await createFile({
      projectId,
      name: 'main.tex',
      content: DEFAULT_BEAMER_TEMPLATE
    });
  } else {
    // Blank template
    await createFile({
      projectId,
      name: 'main.tex',
      content: `\\documentclass{article}\n\\begin{document}\nXin chao Overleaf Clone!\n\\end{document}\n`
    });
  }

  return newProject;
}

export async function updateProject(projectId, updates) {
  const projects = await readJson(PROJECTS_FILE);
  const index = projects.findIndex((p) => p.id === projectId);
  if (index === -1) return null;

  projects[index] = {
    ...projects[index],
    ...updates,
    updatedAt: new Date().toISOString()
  };

  await writeJson(PROJECTS_FILE, projects);
  return projects[index];
}

export async function deleteProject(projectId) {
  const projects = await readJson(PROJECTS_FILE);
  const filtered = projects.filter((p) => p.id !== projectId);
  await writeJson(PROJECTS_FILE, filtered);

  // Xóa toàn bộ file thuộc dự án
  const files = await readJson(FILES_FILE);
  const remainingFiles = files.filter((f) => f.projectId !== projectId);
  await writeJson(FILES_FILE, remainingFiles);

  return true;
}

// ================= FILE OPERATIONS =================

export async function getFilesForProject(projectId) {
  const files = await readJson(FILES_FILE);
  return files.filter((f) => f.projectId === projectId);
}

export async function getFile(fileId) {
  const files = await readJson(FILES_FILE);
  return files.find((f) => f.id === fileId) || null;
}

export async function createFile({ projectId, name, content = '' }) {
  const files = await readJson(FILES_FILE);
  const fileId = `file-${crypto.randomUUID().slice(0, 8)}`;

  const newFile = {
    id: fileId,
    projectId,
    name: name || 'untitled.tex',
    content,
    updatedAt: new Date().toISOString()
  };

  files.push(newFile);
  await writeJson(FILES_FILE, files);

  // Cập nhật updatedAt của dự án
  await updateProject(projectId, {});

  return newFile;
}

export async function updateFile(fileId, updates) {
  const files = await readJson(FILES_FILE);
  const index = files.findIndex((f) => f.id === fileId);
  if (index === -1) return null;

  files[index] = {
    ...files[index],
    ...updates,
    updatedAt: new Date().toISOString()
  };

  await writeJson(FILES_FILE, files);

  if (files[index].projectId) {
    await updateProject(files[index].projectId, {});
  }

  return files[index];
}

export async function deleteFile(fileId) {
  const files = await readJson(FILES_FILE);
  const target = files.find((f) => f.id === fileId);
  const filtered = files.filter((f) => f.id !== fileId);
  await writeJson(FILES_FILE, filtered);

  if (target && target.projectId) {
    await updateProject(target.projectId, {});
  }

  return true;
}

// Templates mặc định
const DEFAULT_ARTICLE_TEMPLATE = `\\documentclass[12pt, a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[vietnamese]{babel}
\\usepackage{amsmath, amssymb, amsthm}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{geometry}
\\usepackage{booktabs}

\\geometry{a4paper, margin=1in}

\\title{\\textbf{Hệ Thống Soạn Thảo \\LaTeX\\ Trực Tuyến Đa Người Dùng}}
\\author{Đội ngũ Phát triển Overleaf Clone}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Tài liệu được quản lý và biên dịch theo cấu trúc tệp tin thời gian thực. Hỗ trợ đa tệp tin (main.tex, references.bib), đồng bộ qua WebSocket ổn định và biên dịch thần tốc bằng Tectonic Engine.
\\end{abstract}

\\section{Giới thiệu Dự án}
Chào mừng bạn đến với môi trường làm việc nhóm chuẩn Overleaf! Bạn có thể:
\\begin{enumerate}
    \\item Tạo nhiều tệp tin (File Manager ở cột bên trái).
    \\item Mời bạn bè tham gia cùng chỉnh sửa bằng nút \\textbf{Chia sẻ}.
    \\item Biên dịch tức thì bằng nút \\textbf{Biên dịch} hoặc tổ hợp phím \\texttt{Ctrl + S}.
\\end{enumerate}

\\section{Công thức Toán học \& Phương trình}
Phương trình hàm sóng Schrödinger trong cơ học lượng tử:
\\begin{equation}
    i\\hbar \\frac{\\partial}{\\partial t} \\Psi(\\mathbf{r}, t) = \\left[ -\\frac{\\hbar^2}{2m}\\nabla^2 + V(\\mathbf{r}, t) \\right] \\Psi(\\mathbf{r}, t)
\\end{equation}

Tích phân Fourier ngược:
\\begin{equation}
    f(x) = \\frac{1}{2\\pi} \\int_{-\\infty}^{+\\infty} \\hat{f}(\\omega) e^{i\\omega x} \\, d\\omega
\\end{equation}

\\section{Bảng dữ liệu Thử nghiệm}
\\begin{table}[h!]
\\centering
\\begin{tabular}{llr}
\\toprule
\\textbf{Tính năng} & \\textbf{Công nghệ} & \\textbf{Độ trễ} \\\\
\\midrule
Xác thực \& Quản lý File & RESTful API & $< 60\\text{ ms}$ \\\\
Đồng bộ cộng tác phòng & WebSocket Server-Centric & $< 15\\text{ ms}$ \\\\
Biên dịch tài liệu & Tectonic CLI Multi-file & $0.6 - 1.2\\text{ s}$ \\\\
\\bottomrule
\\end{tabular}
\\caption{Bảng đánh giá hiệu năng hệ thống Overleaf Clone}
\\label{tab:performance}
\\end{table}

\\section{Kết luận}
Hệ thống sẵn sàng hỗ trợ bạn thực hiện các bài báo cáo, đồ án và luận văn chuyên nghiệp!

\\end{document}
`;

const DEFAULT_BIB_TEMPLATE = `@article{einstein1905,
  author = {Albert Einstein},
  title = {Zur Elektrodynamik bewegter K{\\"o}rper},
  journal = {Annalen der Physik},
  volume = {322},
  number = {10},
  pages = {891--921},
  year = {1905}
}
`;

const DEFAULT_BEAMER_TEMPLATE = `\\documentclass{beamer}
\\usetheme{Madrid}
\\usecolortheme{default}

\\title[Overleaf Clone]{Thuyết Trình Đồ Án LaTeX Trực Tuyến}
\\subtitle{Hệ thống cộng tác và biên dịch tài liệu}
\\author{Nhóm Phát Triển}
\\date{\\today}

\\begin{document}

\\begin{frame}
  \\titlepage
\\end{frame}

\\begin{frame}{Nội dung báo cáo}
  \\tableofcontents
\\end{frame}

\\section{Tổng quan}
\\begin{frame}{Tổng quan hệ thống}
  \\begin{itemize}
    \\item Giao diện trực quan chia 3 cột giống Overleaf.
    \\item Quản lý nhiều tệp tin mã nguồn trong cùng dự án.
    \\item Đồng bộ thời gian thực không lo bị ngắt kết nối.
  \\end{itemize}
\\end{frame}

\\section{Công thức}
\\begin{frame}{Công thức toán học trên Slide}
  Định lý Pythagoras:
  \\[ a^2 + b^2 = c^2 \\]
  Phương trình nổi tiếng của Einstein:
  \\[ E = mc^2 \\]
\\end{frame}

\\begin{frame}
  \\centering \\Huge \\textbf{Xin cảm ơn!}
\\end{frame}

\\end{document}
`;

// Tự động khởi tạo DB khi module được load
initDb().catch((err) => console.error('Lỗi khởi tạo DB:', err));
