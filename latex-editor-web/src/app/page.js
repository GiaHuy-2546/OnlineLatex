'use client';

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Play,
  Download,
  Copy,
  Check,
  Users,
  Terminal,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  FileCode,
  FileText,
  RotateCw,
  ExternalLink,
  Wifi,
  WifiOff,
  FolderPlus,
  FilePlus,
  Trash2,
  Edit2,
  ArrowLeft,
  Search,
  Plus,
  Share2,
  LogOut,
  User,
  BookOpen,
  Sparkles,
  Layers,
  X,
  Clock
} from 'lucide-react';

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

const USER_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#10b981',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'
];

function OverleafStudio() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Xác thực & Tài khoản người dùng
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authEmail, setAuthEmail] = useState('demo@latex.online');
  const [authPassword, setAuthPassword] = useState('123456');
  const [authName, setAuthName] = useState('Thành viên Mới');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Chế độ hiển thị: 'dashboard' hoặc 'editor'
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'editor'

  // Danh sách dự án (Dashboard)
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectTemplate, setNewProjectTemplate] = useState('article'); // 'article' | 'beamer' | 'blank'

  // Dự án đang mở (Editor Mode)
  const [currentProject, setCurrentProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [activeFileId, setActiveFileId] = useState(null);

  // Realtime & Cộng tác WebSocket
  const [collaborators, setCollaborators] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [serverSignalingUrl, setServerSignalingUrl] = useState('');
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // File Manager Modal (Tạo file / Đổi tên)
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [renamingFileId, setRenamingFileId] = useState(null);
  const [renameInput, setRenameInput] = useState('');

  // Biên dịch & Trình xem PDF
  const [isCompiling, setIsCompiling] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [compileStatus, setCompileStatus] = useState('idle'); // 'idle' | 'success' | 'error'
  const [errorLogs, setErrorLogs] = useState('');
  const [isLogExpanded, setIsLogExpanded] = useState(false);
  const [compileTime, setCompileTime] = useState(null);

  // Modal chia sẻ dự án
  const [showShareModal, setShowShareModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Monaco Editor Ref
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  // Màu sắc cá nhân ngẫu nhiên
  const [userColor] = useState(() => USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]);

  // 1. Tự động kiểm tra phiên đăng nhập đã lưu trong LocalStorage khi tải trang
  useEffect(() => {
    const savedUser = localStorage.getItem('latex_user');
    const savedToken = localStorage.getItem('latex_token');

    if (savedUser && savedToken) {
      try {
        setUser(JSON.parse(savedUser));
        setToken(savedToken);
      } catch {
        localStorage.removeItem('latex_user');
        localStorage.removeItem('latex_token');
      }
    }
  }, []);

  // 2. Lấy URL WebSocket động từ API /api/config
  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.signalingUrl) {
          setServerSignalingUrl(data.signalingUrl);
        }
      })
      .catch((err) => console.warn('Không thể nạp /api/config:', err));
  }, []);

  // 3. Tải danh sách dự án khi người dùng đăng nhập
  const fetchProjects = useCallback(async (authToken) => {
    const tk = authToken || token;
    if (!tk) return;

    setProjectsLoading(true);
    try {
      const res = await fetch('/api/backend/projects', {
        headers: { Authorization: `Bearer ${tk}` },
      });
      const data = await res.json();
      if (res.ok && data.projects) {
        setProjects(data.projects);
      }
    } catch (err) {
      console.error('Lỗi lấy danh sách dự án:', err);
    } finally {
      setProjectsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchProjects(token);
    }
  }, [token, fetchProjects]);

  // 4. Mở dự án theo URL query param (?project=... hoặc ?room=...)
  useEffect(() => {
    const projectIdFromUrl = searchParams.get('project') || searchParams.get('room');
    if (projectIdFromUrl && token) {
      loadProject(projectIdFromUrl);
    }
  }, [searchParams, token]);

  // Hàm Đăng nhập
  const handleLogin = async (e) => {
    e?.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    try {
      const res = await fetch('/api/backend/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });
      const data = await res.json();

      if (res.ok && data.token) {
        setUser(data.user);
        setToken(data.token);
        localStorage.setItem('latex_user', JSON.stringify(data.user));
        localStorage.setItem('latex_token', data.token);
        fetchProjects(data.token);
      } else {
        setAuthError(data.error || 'Đăng nhập không thành công.');
      }
    } catch (err) {
      setAuthError('Không thể kết nối đến máy chủ xác thực.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Hàm Đăng ký
  const handleRegister = async (e) => {
    e?.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    try {
      const res = await fetch('/api/backend/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword, name: authName }),
      });
      const data = await res.json();

      if (res.ok && data.token) {
        setUser(data.user);
        setToken(data.token);
        localStorage.setItem('latex_user', JSON.stringify(data.user));
        localStorage.setItem('latex_token', data.token);
        fetchProjects(data.token);
      } else {
        setAuthError(data.error || 'Đăng ký không thành công.');
      }
    } catch (err) {
      setAuthError('Không thể kết nối đến máy chủ xác thực.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Hàm Đăng nhập nhanh chế độ Khách (Guest Login) - Không cần email/mật khẩu
  const handleGuestLogin = async () => {
    setAuthLoading(true);
    setAuthError('');

    try {
      const res = await fetch('/api/backend/auth/guest', { method: 'POST' });
      const data = await res.json();

      if (res.ok && data.token) {
        setUser(data.user);
        setToken(data.token);
        localStorage.setItem('latex_user', JSON.stringify(data.user));
        localStorage.setItem('latex_token', data.token);

        if (data.defaultProjectId) {
          loadProject(data.defaultProjectId, data.token);
        } else {
          fetchProjects(data.token);
        }
      } else {
        setAuthError(data.error || 'Lỗi khởi tạo phiên khách.');
      }
    } catch (err) {
      setAuthError('Không thể kết nối đến máy chủ xác thực.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Hàm Đăng xuất
  const handleLogout = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setUser(null);
    setToken(null);
    setCurrentProject(null);
    setFiles([]);
    setView('dashboard');
    localStorage.removeItem('latex_user');
    localStorage.removeItem('latex_token');
    router.push('/');
  };

  // Hàm Tải chi tiết dự án và mở Studio
  const loadProject = async (projectId, customToken) => {
    const tk = customToken || token;
    try {
      const res = await fetch(`/api/backend/projects/${projectId}`, {
        headers: tk ? { Authorization: `Bearer ${tk}` } : {},
      });
      const data = await res.json();

      if (res.ok && data.project) {
        setCurrentProject(data.project);
        setFiles(data.files || []);

        // Chọn file active mặc định (ưu tiên main.tex)
        const mainFile = (data.files || []).find((f) => f.name === 'main.tex') || data.files[0];
        if (mainFile) {
          setActiveFileId(mainFile.id);
        }

        setView('editor');
        router.push(`/?project=${projectId}`);
      }
    } catch (err) {
      console.error('Lỗi tải dự án:', err);
    }
  };

  // Hàm Tạo dự án mới
  const handleCreateProject = async (e) => {
    e?.preventDefault();
    if (!newProjectTitle.trim()) return;

    try {
      const res = await fetch('/api/backend/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newProjectTitle.trim(),
          template: newProjectTemplate,
        }),
      });
      const data = await res.json();

      if (res.ok && data.project) {
        setShowNewProjectModal(false);
        setNewProjectTitle('');
        loadProject(data.project.id);
      }
    } catch (err) {
      alert('Không thể tạo dự án: ' + err.message);
    }
  };

  // Hàm Xóa dự án
  const handleDeleteProject = async (projectId, e) => {
    e?.stopPropagation();
    if (!confirm('Bạn có chắc chắn muốn xóa dự án này vĩnh viễn?')) return;

    try {
      const res = await fetch(`/api/backend/projects/${projectId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
      }
    } catch (err) {
      alert('Lỗi xóa dự án: ' + err.message);
    }
  };

  // File đang được kích hoạt chỉnh sửa
  const activeFile = files.find((f) => f.id === activeFileId);

  // ==============================================================================
  // KẾT NỐI WEBSOCKET CỘNG TÁC THỜI GIAN THỰC (SERVER-CENTRIC - CHỐNG DISCONNECT)
  // ==============================================================================
  useEffect(() => {
    if (!currentProject || !user || view !== 'editor') return;

    let isSubscribed = true;

    const connectWebSocket = () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

      // Xác định endpoint WebSocket (từ /api/config hoặc localhost hoặc domain hiện tại)
      let wsBase = serverSignalingUrl;
      if (!wsBase && typeof window !== 'undefined') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        wsBase = isLocal ? 'ws://localhost:5000' : `${protocol}//${window.location.host}`;
      }

      const cleanWsUrl = wsBase ? wsBase.replace(/\/+$/, '') : '';
      const fullUrl = `${cleanWsUrl}/ws?projectId=${encodeURIComponent(currentProject.id)}&userId=${encodeURIComponent(user.id)}&name=${encodeURIComponent(user.name)}&color=${encodeURIComponent(userColor)}`;

      try {
        const ws = new WebSocket(fullUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isSubscribed) return;
          setWsConnected(true);
          console.log('[Realtime] Đã kết nối vào phòng cộng tác:', currentProject.id);
        };

        ws.onmessage = (event) => {
          if (!isSubscribed) return;
          try {
            const msg = JSON.parse(event.data);

            switch (msg.type) {
              case 'ping':
                ws.send(JSON.stringify({ type: 'pong' }));
                break;

              case 'init':
              case 'presence':
                if (msg.users) {
                  setCollaborators(msg.users);
                }
                break;

              case 'content_change':
                // Cập nhật nội dung của file đang được thành viên khác gõ
                setFiles((prevFiles) =>
                  prevFiles.map((f) => (f.id === msg.fileId ? { ...f, content: msg.content } : f))
                );

                // Nếu đang mở đúng file đó trên Monaco Editor, cập nhật giá trị
                if (editorRef.current && activeFileId === msg.fileId && msg.senderId !== user.id) {
                  const currentVal = editorRef.current.getValue();
                  if (currentVal !== msg.content) {
                    const pos = editorRef.current.getPosition();
                    editorRef.current.setValue(msg.content);
                    if (pos) editorRef.current.setPosition(pos);
                  }
                }
                break;

              case 'file_created':
                setFiles((prev) => (prev.some((f) => f.id === msg.file.id) ? prev : [...prev, msg.file]));
                break;

              case 'file_updated':
                setFiles((prev) =>
                  prev.map((f) => (f.id === msg.file.id ? { ...f, ...msg.file } : f))
                );
                break;

              case 'file_deleted':
                setFiles((prev) => prev.filter((f) => f.id !== msg.fileId));
                break;
            }
          } catch (e) {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          if (!isSubscribed) return;
          setWsConnected(false);
          // Tự động kết nối lại sau 2.5s (Auto-reconnect with heartbeat)
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 2500);
        };

        ws.onerror = () => {
          ws.close();
        };

      } catch (err) {
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
      }
    };

    connectWebSocket();

    return () => {
      isSubscribed = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [currentProject, user, view, serverSignalingUrl, userColor, activeFileId]);

  // Xử lý khi người dùng gõ phím trên Monaco Editor (Đồng bộ Realtime + Tự động lưu)
  const handleEditorChange = (newContent) => {
    if (!activeFileId) return;

    // 1. Cập nhật local state
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFileId ? { ...f, content: newContent } : f))
    );

    // 2. Phát tin nhắn qua WebSocket tới các thành viên khác trong phòng ngay lập tức
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'content_change',
          fileId: activeFileId,
          content: newContent,
        })
      );
    }

    // 3. Tự động lưu ngầm vào Database sau 1s (Debounced Auto-save)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (!currentProject || !token) return;
      try {
        await fetch(`/api/backend/projects/${currentProject.id}/files/${activeFileId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: newContent }),
        });
      } catch (err) {
        console.warn('Auto-save error:', err);
      }
    }, 1000);
  };

  // Thêm file mới
  const handleCreateFile = async (e) => {
    e?.preventDefault();
    if (!newFileName.trim() || !currentProject) return;

    let cleanName = newFileName.trim();
    if (!cleanName.includes('.')) cleanName += '.tex';

    try {
      const res = await fetch(`/api/backend/projects/${currentProject.id}/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: cleanName, content: '' }),
      });
      const data = await res.json();

      if (res.ok && data.file) {
        setFiles((prev) => [...prev, data.file]);
        setActiveFileId(data.file.id);
        setShowNewFileModal(false);
        setNewFileName('');
      }
    } catch (err) {
      alert('Lỗi tạo file: ' + err.message);
    }
  };

  // Xóa file
  const handleDeleteFile = async (fileId, e) => {
    e?.stopPropagation();
    if (!confirm('Bạn có chắc muốn xóa tệp tin này?')) return;

    try {
      const res = await fetch(`/api/backend/projects/${currentProject.id}/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== fileId));
        if (activeFileId === fileId) {
          const remaining = files.filter((f) => f.id !== fileId);
          if (remaining.length > 0) setActiveFileId(remaining[0].id);
        }
      }
    } catch (err) {
      alert('Lỗi xóa file: ' + err.message);
    }
  };

  // Đổi tên file
  const handleRenameFile = async (fileId) => {
    if (!renameInput.trim()) {
      setRenamingFileId(null);
      return;
    }

    try {
      const res = await fetch(`/api/backend/projects/${currentProject.id}/files/${fileId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: renameInput.trim() }),
      });
      const data = await res.json();

      if (res.ok && data.file) {
        setFiles((prev) => prev.map((f) => (f.id === fileId ? data.file : f)));
      }
    } catch (err) {
      alert('Lỗi đổi tên: ' + err.message);
    } finally {
      setRenamingFileId(null);
    }
  };

  // ==============================================================================
  // BIÊN DỊCH LATEX ĐA FILE (TECTONIC COMPILER)
  // ==============================================================================
  const handleCompile = useCallback(async () => {
    if (isCompiling || files.length === 0) return;

    const mainFile = files.find((f) => f.name === 'main.tex') || files[0];
    if (!mainFile || !mainFile.content) {
      setErrorLogs('Không tìm thấy nội dung mã nguồn file chính (main.tex) để biên dịch.');
      setCompileStatus('error');
      setIsLogExpanded(true);
      return;
    }

    // Đóng gói toàn bộ các file trong dự án vào payload
    const fileBundle = {};
    files.forEach((f) => {
      fileBundle[f.name] = f.content || '';
    });

    setIsCompiling(true);
    const startTime = performance.now();

    try {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: mainFile.content,
          mainFile: mainFile.name,
          files: fileBundle,
        }),
      });

      const duration = ((performance.now() - startTime) / 1000).toFixed(2);
      setCompileTime(duration);

      const contentType = response.headers.get('content-type') || '';

      if (response.ok && contentType.includes('application/pdf')) {
        const blob = await response.blob();
        if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);

        const newPdfUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(newPdfUrl);
        setCompileStatus('success');
        setErrorLogs('');
        setIsLogExpanded(false);
      } else {
        const errorJson = await response.json().catch(async () => {
          const txt = await response.text();
          return { error: 'Lỗi biên dịch', logs: txt };
        });

        setErrorLogs(errorJson.logs || errorJson.error || 'Biên dịch thất bại.');
        setCompileStatus('error');
        setIsLogExpanded(true);
      }
    } catch (networkError) {
      const duration = ((performance.now() - startTime) / 1000).toFixed(2);
      setCompileTime(duration);
      setErrorLogs(`Lỗi kết nối mạng: ${networkError.message}\nKhông thể gửi mã tới Compiler Service.`);
      setCompileStatus('error');
      setIsLogExpanded(true);
    } finally {
      setIsCompiling(false);
    }
  }, [isCompiling, files, pdfBlobUrl]);

  // Phím tắt Ctrl + S toàn cục
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleCompile();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleCompile]);

  // Monaco Editor mount
  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleCompile();
    });
  };

  // Tự động biên dịch lần đầu khi mở dự án
  useEffect(() => {
    if (view === 'editor' && files.length > 0 && !pdfBlobUrl && !isCompiling) {
      const timer = setTimeout(() => handleCompile(), 1200);
      return () => clearTimeout(timer);
    }
  }, [view, files, pdfBlobUrl, isCompiling, handleCompile]);

  // Sao chép link chia sẻ dự án
  const handleCopyShareLink = () => {
    if (!currentProject) return;
    const shareUrl = `${window.location.origin}/?project=${currentProject.id}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  // ==============================================================================
  // GIAO DIỆN 1: MÀN HÌNH ĐĂNG NHẬP / ĐĂNG KÝ / GUEST
  // ==============================================================================
  if (!user) {
    return (
      <div className="min-h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

          {/* Logo & Header */}
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-indigo-500/30">
              <FileCode className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">LaTeX Studio</h1>
            <p className="text-xs text-slate-400 mt-1">Trình biên tập LaTeX thời gian thực chuẩn Overleaf</p>
          </div>

          {/* Nút dùng thử 1-Click (Guest Mode) */}
          <button
            onClick={handleGuestLogin}
            disabled={authLoading}
            className="w-full py-2.5 px-4 mb-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-900/30 flex items-center justify-center space-x-2 transition-all active:scale-95"
          >
            <Sparkles className="w-4 h-4" />
            <span>Dùng thử ngay (Không cần mật khẩu)</span>
          </button>

          <div className="flex items-center my-4">
            <div className="flex-1 border-t border-slate-800" />
            <span className="px-3 text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Hoặc Đăng Nhập</span>
            <div className="flex-1 border-t border-slate-800" />
          </div>

          {/* Tabs Login / Register */}
          <div className="flex bg-slate-800/80 p-1 rounded-lg mb-5 text-xs font-medium">
            <button
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
              className={`flex-1 py-1.5 rounded-md transition-all ${authMode === 'login' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              Đăng nhập
            </button>
            <button
              onClick={() => { setAuthMode('register'); setAuthError(''); }}
              className={`flex-1 py-1.5 rounded-md transition-all ${authMode === 'register' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              Đăng ký mới
            </button>
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="space-y-3.5">
            {authMode === 'register' && (
              <div>
                <label className="block text-xs text-slate-400 font-medium mb-1">Họ và Tên</label>
                <input
                  type="text"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  required
                  placeholder="Ví dụ: Nguyễn Văn A"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1">Email</label>
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
                placeholder="name@example.com"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 font-medium mb-1">Mật khẩu</label>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-2.5 px-4 mt-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-900/30 transition-all flex items-center justify-center space-x-2"
            >
              {authLoading ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang xử lý...</span>
                </>
              ) : (
                <span>{authMode === 'login' ? 'Đăng nhập vào Studio' : 'Tạo tài khoản'}</span>
              )}
            </button>
          </form>

          {/* Gợi ý tài khoản demo */}
          <div className="mt-5 pt-4 border-t border-slate-800/80 text-center text-[11px] text-slate-500">
            Tài khoản mẫu: <span className="text-slate-300 font-mono">demo@latex.online</span> / <span className="text-slate-300 font-mono">123456</span>
          </div>
        </div>
      </div>
    );
  }

  // ==============================================================================
  // GIAO DIỆN 2: DASHBOARD QUẢN LÝ DỰ ÁN (PROJECT LIST)
  // ==============================================================================
  if (view === 'dashboard') {
    const filteredProjects = projects.filter((p) =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        {/* Header Dashboard */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-500/20">
              <FileCode className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">LaTeX Studio</span>
            <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-medium">Overleaf Edition</span>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowNewProjectModal(true)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-emerald-900/30 flex items-center space-x-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Dự án Mới</span>
            </button>

            <div className="h-6 w-px bg-slate-800" />

            <div className="flex items-center space-x-2 text-xs">
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white shadow">
                {user.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left">
                <div className="font-semibold text-slate-200">{user.name}</div>
                <div className="text-[10px] text-slate-500">{user.email}</div>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-md transition-colors"
                title="Đăng xuất"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Nội dung Dashboard */}
        <main className="flex-1 max-w-6xl w-full mx-auto p-6 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">Dự án của bạn</h2>
              <p className="text-xs text-slate-400 mt-0.5">Quản lý và mở các tài liệu LaTeX trực tuyến</p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Tìm kiếm dự án..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {projectsLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-16">
              <RotateCw className="w-6 h-6 animate-spin text-indigo-500 mb-2" />
              <span className="text-xs">Đang tải danh sách dự án...</span>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex-1 border border-dashed border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
              <BookOpen className="w-12 h-12 text-slate-600 mb-3" />
              <h3 className="text-sm font-semibold text-slate-300">Chưa có dự án nào</h3>
              <p className="text-xs text-slate-500 max-w-xs mt-1 mb-4">
                Bắt đầu soạn thảo báo cáo, bài thuyết trình hoặc luận văn LaTeX ngay hôm nay.
              </p>
              <button
                onClick={() => setShowNewProjectModal(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition-all flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Tạo dự án đầu tiên</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => loadProject(p.id)}
                  className="bg-slate-900 border border-slate-800 hover:border-indigo-500/60 rounded-xl p-4 transition-all duration-200 cursor-pointer hover:shadow-xl hover:shadow-indigo-500/5 group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="w-8 h-8 rounded-lg bg-indigo-600/10 text-indigo-400 flex items-center justify-center mb-3">
                        <FileText className="w-4 h-4" />
                      </div>
                      <button
                        onClick={(e) => handleDeleteProject(p.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-md transition-all"
                        title="Xóa dự án"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <h3 className="font-semibold text-sm text-slate-200 group-hover:text-indigo-300 transition-colors line-clamp-1">
                      {p.title}
                    </h3>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(p.updatedAt).toLocaleDateString('vi-VN')}</span>
                    </span>
                    <span className="font-mono text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                      {p.id}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Modal Tạo Dự án Mới */}
        {showNewProjectModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-white">Tạo Dự Án LaTeX Mới</h3>
                <button
                  onClick={() => setShowNewProjectModal(false)}
                  className="p-1 text-slate-400 hover:text-white rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateProject} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Tên dự án</label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Báo cáo Khoa học Máy tính"
                    value={newProjectTitle}
                    onChange={(e) => setNewProjectTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-2">Mẫu tài liệu (Template)</label>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div
                      onClick={() => setNewProjectTemplate('article')}
                      className={`p-3 border rounded-xl cursor-pointer text-center transition-all ${newProjectTemplate === 'article' ? 'border-indigo-500 bg-indigo-500/10 text-white font-semibold' : 'border-slate-800 bg-slate-800/50 text-slate-400 hover:border-slate-700'}`}
                    >
                      <FileText className="w-5 h-5 mx-auto mb-1.5 text-indigo-400" />
                      <span>Bài báo cáo</span>
                    </div>

                    <div
                      onClick={() => setNewProjectTemplate('beamer')}
                      className={`p-3 border rounded-xl cursor-pointer text-center transition-all ${newProjectTemplate === 'beamer' ? 'border-indigo-500 bg-indigo-500/10 text-white font-semibold' : 'border-slate-800 bg-slate-800/50 text-slate-400 hover:border-slate-700'}`}
                    >
                      <Layers className="w-5 h-5 mx-auto mb-1.5 text-purple-400" />
                      <span>Slide Beamer</span>
                    </div>

                    <div
                      onClick={() => setNewProjectTemplate('blank')}
                      className={`p-3 border rounded-xl cursor-pointer text-center transition-all ${newProjectTemplate === 'blank' ? 'border-indigo-500 bg-indigo-500/10 text-white font-semibold' : 'border-slate-800 bg-slate-800/50 text-slate-400 hover:border-slate-700'}`}
                    >
                      <FileCode className="w-5 h-5 mx-auto mb-1.5 text-slate-400" />
                      <span>Trống</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowNewProjectModal(false)}
                    className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow transition-all"
                  >
                    Tạo Dự Án
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==============================================================================
  // GIAO DIỆN 3: STUDIO CHÍNH (OVERLEAF 3-COLUMN EDITOR & COMPILER)
  // ==============================================================================
  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* 1. HEADER CHÍNH CỦA DỰ ÁN */}
      <header className="h-13 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-3 flex items-center justify-between shrink-0 z-20">
        
        {/* Nút quay lại & Tiêu đề dự án */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => {
              setView('dashboard');
              router.push('/');
            }}
            className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-md transition-colors flex items-center space-x-1"
            title="Quay lại danh sách dự án"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-medium hidden sm:inline">Dự án</span>
          </button>

          <div className="h-4 w-px bg-slate-800" />

          <div className="flex items-center space-x-2">
            <span className="font-semibold text-xs text-slate-200 max-w-[160px] sm:max-w-xs truncate">
              {currentProject?.title}
            </span>
          </div>
        </div>

        {/* Trạng thái kết nối, Danh sách cộng tác viên & Nút Biên dịch */}
        <div className="flex items-center space-x-2.5">
          
          {/* Đèn báo trạng thái kết nối WebSocket */}
          <div className="hidden md:flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-[11px]">
            {wsConnected ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-emerald-400 font-medium">Đồng bộ Thời Gian Thực</span>
              </>
            ) : (
              <>
                <RotateCw className="w-3 h-3 text-amber-400 animate-spin" />
                <span className="text-amber-400">Đang nối lại...</span>
              </>
            )}
          </div>

          {/* Stack avatar cộng tác viên đang online trong phòng */}
          <div className="flex items-center space-x-1 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700/60">
            <Users className="w-3.5 h-3.5 text-slate-400 mr-0.5" />
            <span className="text-xs font-medium text-slate-300">{collaborators.length || 1} online</span>
            
            <div className="flex items-center -space-x-1.5 ml-1">
              {collaborators.map((c) => (
                <div
                  key={c.id}
                  style={{ backgroundColor: c.color || '#3b82f6' }}
                  className="w-5 h-5 rounded-full border border-slate-900 flex items-center justify-center text-[9px] font-bold text-white shadow"
                  title={`${c.name}${c.id === user?.id ? ' (Bạn)' : ''}`}
                >
                  {c.name ? c.name.slice(0, 1).toUpperCase() : 'U'}
                </div>
              ))}
            </div>
          </div>

          {/* Nút Chia sẻ (Mời bạn bè vào phòng) */}
          <button
            onClick={() => setShowShareModal(true)}
            className="flex items-center space-x-1.5 px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-slate-300 transition-colors"
            title="Mời người khác cùng chỉnh sửa"
          >
            <Share2 className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Chia sẻ</span>
          </button>

          <div className="h-4 w-px bg-slate-800 hidden sm:block" />

          {/* NÚT BIÊN DỊCH CHÍNH (Ctrl + S) */}
          <button
            onClick={handleCompile}
            disabled={isCompiling}
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-md shadow transition-all ${
              isCompiling
                ? 'bg-indigo-600/60 cursor-not-allowed text-indigo-200'
                : 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-emerald-700/20'
            }`}
            title="Biên dịch dự án sang PDF (Ctrl + S)"
          >
            {isCompiling ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>Đang dịch...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Biên dịch</span>
                <span className="hidden md:inline-block px-1 py-0.2 bg-emerald-700/50 rounded text-[9px] font-mono text-emerald-200">
                  Ctrl+S
                </span>
              </>
            )}
          </button>

          {/* Nút tải PDF */}
          {pdfBlobUrl && (
            <a
              href={pdfBlobUrl}
              download={`${currentProject?.title || 'document'}.pdf`}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-md transition-colors"
              title="Tải PDF"
            >
              <Download className="w-4 h-4" />
            </a>
          )}
        </div>
      </header>

      {/* 2. KHÔNG GIAN LÀM VIỆC CHÍNH (3 CỘT: FILE TREE - MONACO EDITOR - PDF PREVIEW) */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* CỘT 1: FILE TREE (SIDEBAR QUẢN LÝ TỆP TIN NHƯ OVERLEAF - 200px) */}
        <aside className="w-52 h-full bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
          <div className="h-8 px-3 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 select-none">
            <span className="font-semibold text-slate-300">Tệp tin</span>
            <button
              onClick={() => setShowNewFileModal(true)}
              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded transition-colors"
              title="Thêm tệp tin mới"
            >
              <FilePlus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Danh sách tệp tin */}
          <div className="flex-1 overflow-y-auto py-1">
            {files.map((f) => {
              const isActive = f.id === activeFileId;
              const isRenaming = renamingFileId === f.id;

              return (
                <div
                  key={f.id}
                  onClick={() => {
                    if (!isRenaming) setActiveFileId(f.id);
                  }}
                  className={`group px-3 py-1.5 text-xs flex items-center justify-between cursor-pointer select-none transition-colors ${
                    isActive ? 'bg-indigo-600/20 text-indigo-300 border-l-2 border-indigo-500 font-medium' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate flex-1 mr-1">
                    {f.name.endsWith('.bib') ? (
                      <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    ) : (
                      <FileCode className={`w-3.5 h-3.5 shrink-0 ${f.name === 'main.tex' ? 'text-indigo-400' : 'text-slate-400'}`} />
                    )}

                    {isRenaming ? (
                      <input
                        type="text"
                        autoFocus
                        value={renameInput}
                        onChange={(e) => setRenameInput(e.target.value)}
                        onBlur={() => handleRenameFile(f.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameFile(f.id);
                          if (e.key === 'Escape') setRenamingFileId(null);
                        }}
                        className="bg-slate-800 border border-indigo-500 text-white px-1 py-0.5 rounded text-xs w-full outline-none"
                      />
                    ) : (
                      <span className="truncate">{f.name}</span>
                    )}
                  </div>

                  {!isRenaming && (
                    <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingFileId(f.id);
                          setRenameInput(f.name);
                        }}
                        className="p-1 hover:text-white rounded"
                        title="Đổi tên"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      {f.name !== 'main.tex' && (
                        <button
                          onClick={(e) => handleDeleteFile(f.id, e)}
                          className="p-1 hover:text-rose-400 rounded"
                          title="Xóa tệp"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* CỘT 2: MONACO EDITOR (CHỈNH SỬA MÃ NGUỒN) */}
        <section className="flex-1 h-full flex flex-col bg-[#1e1e1e] min-w-0">
          
          {/* Sub-header Editor: Tabs & Status */}
          <div className="h-8 bg-slate-900 border-b border-slate-800 px-3 flex items-center justify-between text-xs text-slate-400 select-none">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-slate-300 text-xs">{activeFile?.name || 'document.tex'}</span>
              <span className="text-[10px] text-slate-500">• LaTeX</span>
            </div>

            <div className="flex items-center space-x-3 text-[11px] text-slate-500">
              <span>Đang lưu tự động</span>
              <span style={{ color: userColor }}>● {user.name}</span>
            </div>
          </div>

          {/* Monaco Editor Component */}
          <div className="flex-1 relative">
            {activeFile ? (
              <Editor
                height="100%"
                language={activeFile.name.endsWith('.bib') ? 'plaintext' : 'latex'}
                theme="vs-dark"
                value={activeFile.content || ''}
                onChange={handleEditorChange}
                onMount={handleEditorDidMount}
                options={{
                  automaticLayout: true,
                  fontSize: 14,
                  lineNumbers: 'on',
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  tabSize: 2,
                  cursorBlinking: 'smooth',
                  padding: { top: 12, bottom: 12 },
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                Chọn một tệp tin bên trái để bắt đầu soạn thảo
              </div>
            )}
          </div>
        </section>

        {/* CỘT 3: PDF VIEWER & LOGS (XEM TRƯỚC VÀ BÁO LỖI) */}
        <section className="flex-1 h-full flex flex-col bg-slate-900 border-l border-slate-800 relative min-w-0">
          
          {/* Sub-header PDF */}
          <div className="h-8 bg-slate-900 border-b border-slate-800 px-3 flex items-center justify-between text-xs text-slate-400 select-none">
            <div className="flex items-center space-x-2">
              <FileText className="w-3.5 h-3.5 text-rose-400" />
              <span className="font-mono text-slate-300">Bản xem trước PDF</span>
              {compileTime && <span className="text-[10px] text-slate-500">({compileTime}s)</span>}
            </div>

            <div className="flex items-center space-x-2">
              {compileStatus === 'success' && (
                <span className="flex items-center text-emerald-400 text-[11px] space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Sẵn sàng</span>
                </span>
              )}
              {compileStatus === 'error' && (
                <span className="flex items-center text-rose-400 text-[11px] space-x-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>Có lỗi cú pháp</span>
                </span>
              )}
            </div>
          </div>

          {/* Vùng hiển thị PDF */}
          <div className="flex-1 relative bg-slate-950 overflow-hidden">
            {pdfBlobUrl ? (
              <iframe
                src={`${pdfBlobUrl}#toolbar=1&navpanes=0&view=FitH`}
                title="PDF Preview"
                className="w-full h-full border-0 bg-slate-900"
              />
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center p-8 text-center bg-slate-950 text-slate-400">
                <FileText className="w-10 h-10 text-slate-600 mb-2" />
                <h4 className="text-sm font-semibold text-slate-300">Chưa có bản xem trước PDF</h4>
                <p className="text-xs text-slate-500 max-w-xs mt-1 mb-3">
                  Nhấn <strong className="text-emerald-400 font-mono">Ctrl + S</strong> hoặc nút <strong className="text-emerald-400">Biên dịch</strong> để xuất PDF với Tectonic.
                </p>
                <button
                  onClick={handleCompile}
                  disabled={isCompiling}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold shadow"
                >
                  Biên dịch ngay
                </button>
              </div>
            )}

            {isCompiling && (
              <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-xl flex flex-col items-center">
                  <RotateCw className="w-6 h-6 text-indigo-400 animate-spin mb-2" />
                  <span className="text-xs font-semibold text-slate-200">Đang biên dịch LaTeX...</span>
                </div>
              </div>
            )}
          </div>

          {/* Bảng báo lỗi biên dịch có thể thu gọn / mở rộng */}
          <div
            className={`border-t border-slate-800 bg-slate-900 transition-all duration-200 flex flex-col shrink-0 ${
              isLogExpanded ? 'h-52' : 'h-8'
            }`}
          >
            <div
              onClick={() => setIsLogExpanded(!isLogExpanded)}
              className="h-8 px-3 flex items-center justify-between cursor-pointer hover:bg-slate-800/60 select-none text-xs"
            >
              <div className="flex items-center space-x-2">
                <Terminal className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-slate-300">Nhật ký biên dịch (Logs)</span>
                {compileStatus === 'error' && (
                  <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[10px] font-semibold border border-rose-500/40">
                    Lỗi biên dịch
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-1 text-slate-400 text-xs">
                <span>{isLogExpanded ? 'Thu gọn' : 'Mở rộng'}</span>
                {isLogExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              </div>
            </div>

            {isLogExpanded && (
              <div className="flex-1 bg-slate-950 p-3 overflow-auto font-mono text-xs text-slate-300 select-text">
                {errorLogs ? (
                  <pre className="whitespace-pre-wrap break-words text-rose-300">{errorLogs}</pre>
                ) : (
                  <div className="text-slate-500 italic">Không có lỗi nào.</div>
                )}
              </div>
            )}
          </div>

        </section>

      </main>

      {/* MODAL THÊM TỆP MỚI */}
      {showNewFileModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-sm p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-3">Tạo tệp tin mới</h3>
            <form onSubmit={handleCreateFile} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tên tệp (vd: chapter1.tex, references.bib)</label>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="chapter1.tex"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewFileModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold"
                >
                  Tạo Tệp
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CHIA SẺ DỰ ÁN */}
      {showShareModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white">Chia sẻ Dự Án Cộng Tác</h3>
              <button onClick={() => setShowShareModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Gửi liên kết này cho bạn bè hoặc cộng sự. Bất kỳ ai mở liên kết sẽ tham gia ngay vào cùng phòng soạn thảo thời gian thực!
            </p>

            <div className="flex items-center space-x-2 bg-slate-800 p-2 rounded-lg border border-slate-700">
              <input
                type="text"
                readOnly
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/?project=${currentProject?.id}`}
                className="bg-transparent text-xs text-slate-200 flex-1 outline-none font-mono"
              />
              <button
                onClick={handleCopyShareLink}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded transition-colors flex items-center space-x-1"
              >
                {copiedLink ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                <span>{copiedLink ? 'Đã chép' : 'Sao chép'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
          <RotateCw className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
          <p className="text-sm font-medium">Đang khởi tạo Overleaf Studio...</p>
        </div>
      }
    >
      <OverleafStudio />
    </Suspense>
  );
}
