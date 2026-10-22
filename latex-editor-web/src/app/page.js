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
  WifiOff
} from 'lucide-react';

// Dynamic import Monaco Editor với SSR: false
const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

const DEFAULT_LATEX_TEMPLATE = `\\documentclass[12pt, a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[vietnamese]{babel}
\\usepackage{amsmath, amssymb, amsthm}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{geometry}
\\usepackage{booktabs}

\\geometry{a4paper, margin=1in}

\\title{\\textbf{Báo Cáo Nghiên Cứu \\& Thử Nghiệm}}
\\author{Nhóm Cộng Tác Trực Tuyến}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Tài liệu mẫu được tạo và biên dịch thời gian thực bởi hệ thống \\textbf{LaTeX Online Studio}. Hỗ trợ đồng bộ hóa phím gõ P2P nhiều người dùng cùng Tectonic Typesetting Engine.
\\end{abstract}

\\section{Giới thiệu chung}
Chào mừng bạn đến với môi trường soạn thảo LaTeX trực tuyến! Bạn có thể gửi liên kết phòng cho bạn bè hoặc đồng nghiệp để cùng cộng tác chỉnh sửa văn bản theo thời gian thực (hỗ trợ 5--10 người đồng thời).

\\subsection{Các tính năng chính}
\\begin{itemize}
    \\item \\textbf{Đồng bộ P2P tức thì:} Nhờ công nghệ Yjs và WebRTC, mọi thao tác chỉnh sửa được cập nhật ngay lập tức.
    \\item \\textbf{Biên dịch siêu tốc:} Sử dụng Tectonic Compiler hiện đại tích hợp sẵn trong Docker container.
    \\item \\textbf{Phím tắt tiện dụng:} Nhấn \\texttt{Ctrl + S} (hoặc \\texttt{Cmd + S}) để biên dịch và xem trước PDF ngay lập tức.
\\end{itemize}

\\section{Công thức Toán học}
Hệ thống hỗ trợ toàn bộ các gói ký hiệu toán học phổ biến của \\LaTeX:

Phương trình năng lượng của Einstein:
\\begin{equation}
    E = mc^2
\\end{equation}

Tích phân hàm Gauss nhiều chiều:
\\begin{equation}
    \\int_{-\\infty}^{+\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}
\\end{equation}

Định lý Euler tuyệt đẹp:
\\begin{equation}
    e^{i\\pi} + 1 = 0
\\end{equation}

Ma trận xoay trong không gian 2D:
\\begin{equation}
    R(\\theta) = \\begin{pmatrix}
        \\cos\\theta & -\\sin\\theta \\\\
        \\sin\\theta & \\cos\\theta
    \\end{pmatrix}
\\end{equation}

\\section{Bảng dữ liệu mẫu}
Dưới đây là bảng đánh giá hiệu năng thử nghiệm:

\\begin{table}[h!]
\\centering
\\begin{tabular}{llr}
\\toprule
\\textbf{Thành phần} & \\textbf{Công nghệ} & \\textbf{Thời gian phản hồi} \\\\
\\midrule
Frontend Studio & Next.js 14 + Tailwind & $< 50\\text{ ms}$ \\\\
Realtime Sync & Yjs + WebRTC & $< 20\\text{ ms}$ \\\\
Compiler Microservice & Tectonic Engine & $0.5 - 1.5\\text{ s}$ \\\\
\\bottomrule
\\end{tabular}
\\caption{Bảng thông số hiệu năng kiến trúc hệ thống}
\\label{tab:performance}
\\end{table}

\\section{Kết luận}
Hệ thống sẵn sàng cho việc soạn thảo bài báo khoa học, luận văn, giáo trình và tài liệu kỹ thuật nhóm một cách trực quan, mượt mà và hiệu quả.

\\end{document}
`;

const USER_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#10b981',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'
];

function LatexStudio() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Xác định Room ID từ URL searchParams hoặc mặc định
  const urlRoom = searchParams.get('room');
  const [roomId, setRoomId] = useState(urlRoom || 'room-chung');
  const [roomInput, setRoomInput] = useState(urlRoom || 'room-chung');

  // Khởi tạo thông tin người dùng cục bộ cố định (không bị re-render đổi thông tin)
  const [localUser] = useState(() => {
    const randomColor = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
    const randomId = Math.floor(1000 + Math.random() * 9000);
    return {
      name: `Thành viên #${randomId}`,
      color: randomColor,
    };
  });

  // Trạng thái kết nối & cộng tác
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connecting' | 'connected' | 'disconnected'
  const [peers, setPeers] = useState([]);

  // Trạng thái biên dịch & hiển thị
  const [isCompiling, setIsCompiling] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [compileStatus, setCompileStatus] = useState('idle'); // 'idle' | 'success' | 'error'
  const [errorLogs, setErrorLogs] = useState('');
  const [isLogExpanded, setIsLogExpanded] = useState(false);
  const [compileTime, setCompileTime] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // References cho Monaco & Yjs
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const bindingRef = useRef(null);
  const currentRoomRef = useRef(null);

  // Cập nhật roomId từ URL nếu URL thay đổi
  useEffect(() => {
    if (urlRoom && urlRoom !== roomId) {
      setRoomId(urlRoom);
      setRoomInput(urlRoom);
    }
  }, [urlRoom, roomId]);

  // Hàm biên dịch LaTeX
  const handleCompile = useCallback(async () => {
    if (isCompiling) return;

    let code = '';
    if (editorRef.current) {
      code = editorRef.current.getValue();
    } else if (ydocRef.current) {
      code = ydocRef.current.getText('monaco').toString();
    }

    if (!code || !code.trim()) {
      setErrorLogs('Không thể biên dịch: Mã nguồn LaTeX đang trống.');
      setCompileStatus('error');
      setIsLogExpanded(true);
      return;
    }

    setIsCompiling(true);
    const startTime = performance.now();

    try {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      const duration = ((performance.now() - startTime) / 1000).toFixed(2);
      setCompileTime(duration);

      const contentType = response.headers.get('content-type') || '';

      if (response.ok && contentType.includes('application/pdf')) {
        const blob = await response.blob();
        
        // Hủy blob URL cũ nếu có để tránh rò rỉ bộ nhớ
        if (pdfBlobUrl) {
          URL.revokeObjectURL(pdfBlobUrl);
        }

        const newPdfUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(newPdfUrl);
        setCompileStatus('success');
        setErrorLogs('');
        setIsLogExpanded(false);
      } else {
        // Lỗi biên dịch
        const errorJson = await response.json().catch(async () => {
          const txt = await response.text();
          return { error: 'Lỗi biên dịch', logs: txt };
        });

        setErrorLogs(errorJson.logs || errorJson.error || 'Biên dịch thất bại.');
        setCompileStatus('error');
        setIsLogExpanded(true); // Tự động mở khung báo lỗi
      }
    } catch (networkError) {
      const duration = ((performance.now() - startTime) / 1000).toFixed(2);
      setCompileTime(duration);
      setErrorLogs(`Lỗi kết nối mạng: ${networkError.message}\nKhông thể gửi mã tới API proxy biên dịch.`);
      setCompileStatus('error');
      setIsLogExpanded(true);
    } finally {
      setIsCompiling(false);
    }
  }, [isCompiling, pdfBlobUrl]);

  // Thiết lập Yjs & WebRTC Collab
  const setupCollaboration = useCallback(async (editor, monaco, targetRoom) => {
    try {
      // Dọn dẹp session cũ nếu đã có
      if (bindingRef.current) {
        bindingRef.current.destroy();
        bindingRef.current = null;
      }
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
      if (ydocRef.current) {
        ydocRef.current.destroy();
        ydocRef.current = null;
      }

      currentRoomRef.current = targetRoom;
      setConnectionStatus('connecting');

      // Dynamic import các thư viện collab phía client
      const Y = await import('yjs');
      const { WebrtcProvider } = await import('y-webrtc');
      const { MonacoBinding } = await import('y-monaco');

      // Khởi tạo Yjs doc
      const ydoc = new Y.Doc();
      ydocRef.current = ydoc;

      // Xác định danh sách signaling server:
      // 1. Biến môi trường tùy chỉnh
      // 2. Local signaling chạy kèm compiler-service (ws://localhost:5000)
      // 3. Compiler URL production nếu có (chuyển https sang wss)
      const signalingServers = [];

      if (process.env.NEXT_PUBLIC_SIGNALING_URL) {
        signalingServers.push(process.env.NEXT_PUBLIC_SIGNALING_URL);
      }

      if (typeof window !== 'undefined') {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocal) {
          signalingServers.push('ws://localhost:5000');
        }
      }

      if (process.env.NEXT_PUBLIC_COMPILER_URL) {
        const compilerWs = process.env.NEXT_PUBLIC_COMPILER_URL
          .replace(/^http:\/\//, 'ws://')
          .replace(/^https:\/\//, 'wss://');
        if (!signalingServers.includes(compilerWs)) {
          signalingServers.push(compilerWs);
        }
      }

      // Dự phòng máy chủ cộng đồng nếu không cấu hình
      if (signalingServers.length === 0) {
        signalingServers.push('wss://y-webrtc-eu.fly.dev');
      }

      // Khởi tạo WebRTC Provider
      const roomChannelName = `latex-studio-${targetRoom}`;
      const provider = new WebrtcProvider(roomChannelName, ydoc, {
        signaling: signalingServers,
        password: null,
        filterBcConns: false, // Cho phép giao tiếp đa kênh giữa các tab
      });
      providerRef.current = provider;

      // Cài đặt thông tin nhận diện Awareness (Tên & Màu con trỏ)
      provider.awareness.setLocalStateField('user', {
        name: localUser.name,
        color: localUser.color,
      });

      // Lắng nghe cập nhật người dùng trong phòng
      const updatePeers = () => {
        const states = provider.awareness.getStates();
        const peerList = [];
        states.forEach((state, clientID) => {
          if (state && state.user) {
            peerList.push({
              clientId: clientID,
              name: state.user.name,
              color: state.user.color,
              isSelf: clientID === ydoc.clientID,
            });
          }
        });
        setPeers(peerList);
        setConnectionStatus(peerList.length > 0 ? 'connected' : 'connecting');
      };

      provider.awareness.on('change', updatePeers);
      provider.on('status', (event) => {
        if (event.status === 'connected') {
          setConnectionStatus('connected');
        }
      });

      // Cập nhật trạng thái peers ngay ban đầu
      updatePeers();

      // Binding Yjs text vào Monaco Editor Model
      const yText = ydoc.getText('monaco');
      const model = editor.getModel();

      const binding = new MonacoBinding(
        yText,
        model,
        new Set([editor]),
        provider.awareness
      );
      bindingRef.current = binding;

      // Xử lý nạp template mặc định nếu phòng mới hoàn toàn
      provider.on('synced', (event) => {
        if (event.synced) {
          setConnectionStatus('connected');
          if (yText.length === 0) {
            yText.insert(0, DEFAULT_LATEX_TEMPLATE);
          }
        }
      });

      // Fallback nạp template nếu phòng tạo đầu tiên chưa nhận event synced
      setTimeout(() => {
        if (yText.length === 0 && editor.getValue().trim() === '') {
          yText.insert(0, DEFAULT_LATEX_TEMPLATE);
        }
      }, 1000);

    } catch (error) {
      console.error('Lỗi khởi tạo WebRTC/Yjs:', error);
      setConnectionStatus('disconnected');
    }
  }, [localUser]);

  // Xử lý khi Monaco Editor mount
  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Đăng ký phím tắt Ctrl+S / Cmd+S bên trong Monaco Editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleCompile();
    });

    // Khởi tạo phòng collab
    setupCollaboration(editor, monaco, roomId);
  };

  // Lắng nghe sự kiện bàn phím toàn cục cho Ctrl+S / Cmd+S
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

  // Tái khởi tạo Collab khi roomId thay đổi
  useEffect(() => {
    if (editorRef.current && monacoRef.current && currentRoomRef.current !== roomId) {
      setupCollaboration(editorRef.current, monacoRef.current, roomId);
    }
  }, [roomId, setupCollaboration]);

  // Dọn dẹp khi unmount trang
  useEffect(() => {
    return () => {
      if (bindingRef.current) bindingRef.current.destroy();
      if (providerRef.current) providerRef.current.destroy();
      if (ydocRef.current) ydocRef.current.destroy();
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  // Hàm chuyển phòng
  const handleSwitchRoom = (e) => {
    e.preventDefault();
    const cleanRoom = roomInput.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (cleanRoom && cleanRoom !== roomId) {
      setRoomId(cleanRoom);
      router.push(`/?room=${encodeURIComponent(cleanRoom)}`);
    }
  };

  // Hàm sao chép link phòng chia sẻ
  const handleCopyShareLink = () => {
    const url = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  // Hàm tải về file .tex
  const handleDownloadTex = () => {
    const code = editorRef.current ? editorRef.current.getValue() : '';
    const blob = new Blob([code], { type: 'text/x-tex;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${roomId || 'document'}.tex`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Tự động biên dịch lần đầu tiên khi người dùng mở trang
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!pdfBlobUrl && !isCompiling) {
        handleCompile();
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [handleCompile, pdfBlobUrl, isCompiling]);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* HEADER THANH CÔNG CỤ CHÍNH */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-4 flex items-center justify-between shrink-0 z-20">
        
        {/* LOGO & ROOM INFO */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <FileCode className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent hidden sm:inline">
              LaTeX Studio
            </span>
          </div>

          <div className="h-5 w-px bg-slate-700 hidden sm:block" />

          {/* Form nhập Room ID */}
          <form onSubmit={handleSwitchRoom} className="flex items-center space-x-1.5">
            <div className="relative flex items-center">
              <span className="absolute left-2.5 text-xs text-slate-400 font-medium">Room:</span>
              <input
                type="text"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                placeholder="Tên phòng..."
                className="pl-14 pr-2.5 py-1 text-xs bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-36 transition-all"
              />
            </div>
            <button
              type="submit"
              className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md font-medium text-slate-300 transition-colors"
              title="Vào phòng này"
            >
              Vào
            </button>
          </form>

          {/* Nút copy link chia sẻ */}
          <button
            onClick={handleCopyShareLink}
            className={`flex items-center space-x-1.5 px-2.5 py-1 text-xs rounded-md border transition-all ${
              copiedLink
                ? 'bg-emerald-950/70 border-emerald-600 text-emerald-300'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
            }`}
            title="Sao chép liên kết phòng để mời bạn bè"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">{copiedLink ? 'Đã sao chép link' : 'Mời bạn bè'}</span>
          </button>
        </div>

        {/* THÔNG TIN KẾT NỐI & DANH SÁCH PEERS */}
        <div className="flex items-center space-x-3">
          
          {/* Trạng thái kết nối */}
          <div className="hidden lg:flex items-center space-x-2 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs">
            {connectionStatus === 'connected' ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-emerald-400 font-medium">P2P Đồng bộ</span>
              </>
            ) : connectionStatus === 'connecting' ? (
              <>
                <RotateCw className="w-3 h-3 text-amber-400 animate-spin" />
                <span className="text-amber-400">Đang nối P2P...</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-rose-400" />
                <span className="text-rose-400">Mất kết nối</span>
              </>
            )}
          </div>

          {/* Danh sách người dùng trực tuyến */}
          <div className="flex items-center space-x-1.5 bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-700/60">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-medium text-slate-300">{peers.length || 1} online</span>
            
            <div className="flex items-center -space-x-1.5 ml-1">
              {peers.slice(0, 5).map((peer) => (
                <div
                  key={peer.clientId}
                  style={{ backgroundColor: peer.color || '#3b82f6' }}
                  className="w-5 h-5 rounded-full border border-slate-900 flex items-center justify-center text-[9px] font-bold text-white shadow"
                  title={`${peer.name}${peer.isSelf ? ' (Bạn)' : ''}`}
                >
                  {peer.name ? peer.name.slice(0, 1).toUpperCase() : 'U'}
                </div>
              ))}
              {peers.length > 5 && (
                <div className="w-5 h-5 rounded-full bg-slate-700 border border-slate-900 flex items-center justify-center text-[9px] text-slate-300">
                  +{peers.length - 5}
                </div>
              )}
            </div>
          </div>

          <div className="h-5 w-px bg-slate-700 hidden sm:block" />

          {/* NÚT BIÊN DỊCH CHÍNH (Ctrl + S) */}
          <button
            onClick={handleCompile}
            disabled={isCompiling}
            className={`flex items-center space-x-2 px-3.5 py-1.5 text-xs font-semibold rounded-md shadow-md transition-all ${
              isCompiling
                ? 'bg-indigo-600/60 cursor-not-allowed text-indigo-200'
                : 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-emerald-700/20'
            }`}
            title="Biên dịch mã LaTeX sang PDF (Phím tắt: Ctrl + S)"
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
                <span className="hidden md:inline-block px-1.5 py-0.2 bg-emerald-700/50 rounded text-[10px] font-mono text-emerald-200">
                  Ctrl+S
                </span>
              </>
            )}
          </button>

          {/* NÚT TẢI VỀ PDF */}
          {pdfBlobUrl && (
            <a
              href={pdfBlobUrl}
              download={`${roomId || 'document'}.pdf`}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-md transition-colors"
              title="Tải file PDF đã biên dịch"
            >
              <Download className="w-4 h-4" />
            </a>
          )}

          {/* NÚT TẢI VỀ .TEX */}
          <button
            onClick={handleDownloadTex}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-md transition-colors hidden sm:block"
            title="Tải mã nguồn document.tex"
          >
            <FileText className="w-4 h-4" />
          </button>

        </div>
      </header>

      {/* KHÔNG GIAN LÀM VIỆC CHÍNH (CHIA ĐÔI 2 CỘT 50% - 50%) */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* CỘT TRÁI: MONACO EDITOR (50% CHIỀU RỘNG) */}
        <section className="w-1/2 h-full flex flex-col border-r border-slate-800 bg-[#1e1e1e]">
          
          {/* Sub-header Editor */}
          <div className="h-8 bg-slate-900 border-b border-slate-800 px-3 flex items-center justify-between text-xs text-slate-400 select-none">
            <div className="flex items-center space-x-2">
              <FileCode className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-mono text-slate-300">document.tex</span>
              <span className="text-[10px] text-slate-500">LaTeX • UTF-8</span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-[11px] text-slate-500">
                Bạn: <strong style={{ color: localUser.color }}>{localUser.name}</strong>
              </span>
            </div>
          </div>

          {/* Monaco Editor Container */}
          <div className="flex-1 relative">
            <Editor
              height="100%"
              language="latex"
              theme="vs-dark"
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
                cursorSmoothCaretAnimation: 'on',
                bracketPairColorization: { enabled: true },
                formatOnPaste: false,
                padding: { top: 12, bottom: 12 },
              }}
              loading={
                <div className="h-full w-full flex items-center justify-center bg-[#1e1e1e] text-slate-400 text-sm">
                  <RotateCw className="w-5 h-5 animate-spin mr-2 text-indigo-500" />
                  Đang khởi tạo trình soạn thảo Monaco...
                </div>
              }
            />
          </div>
        </section>

        {/* CỘT PHẢI: PDF VIEWER & BẢNG BÁO LỖI (50% CHIỀU RỘNG) */}
        <section className="w-1/2 h-full flex flex-col bg-slate-900 relative">
          
          {/* Sub-header PDF Viewer */}
          <div className="h-8 bg-slate-900 border-b border-slate-800 px-3 flex items-center justify-between text-xs text-slate-400 select-none">
            <div className="flex items-center space-x-2">
              <FileText className="w-3.5 h-3.5 text-rose-400" />
              <span className="font-mono text-slate-300">document.pdf</span>
              {compileTime && (
                <span className="text-[10px] text-slate-500">
                  (Biên dịch: {compileTime}s với Tectonic)
                </span>
              )}
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
              {pdfBlobUrl && (
                <a
                  href={pdfBlobUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white transition-colors"
                  title="Mở PDF trong tab mới"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          {/* VÙNG HIỂN THỊ PDF CHÍNH */}
          <div className="flex-1 relative bg-slate-950 overflow-hidden">
            {pdfBlobUrl ? (
              <iframe
                src={`${pdfBlobUrl}#toolbar=1&navpanes=0&view=FitH`}
                title="Bản xem trước PDF LaTeX"
                className="w-full h-full border-0 bg-slate-900"
              />
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center p-8 text-center bg-slate-950 text-slate-400">
                <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-slate-500">
                  <FileText className="w-8 h-8" />
                </div>
                <h3 className="text-base font-semibold text-slate-200 mb-1">
                  Chưa có bản xem trước PDF
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mb-4">
                  Nhấn nút <strong className="text-emerald-400">Biên dịch</strong> hoặc phím tắt <strong className="text-indigo-400 font-mono">Ctrl + S</strong> để Tectonic Engine biên dịch file TeX thành PDF.
                </p>
                <button
                  onClick={handleCompile}
                  disabled={isCompiling}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-md shadow-lg transition-all flex items-center space-x-2"
                >
                  {isCompiling ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin" />
                      <span>Đang biên dịch...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Biên dịch ngay</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Overlay hiển thị khi đang biên dịch */}
            {isCompiling && (
              <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-2xl flex flex-col items-center max-w-xs text-center">
                  <RotateCw className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
                  <h4 className="text-sm font-semibold text-slate-200">Đang biên dịch LaTeX...</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Tectonic Engine đang xử lý mã nguồn và sinh trang PDF.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* BẢNG BÁO LỖI (ERROR LOG PANEL) CÓ THỂ THU GỌN / MỞ RỘNG */}
          <div
            className={`border-t border-slate-800 bg-slate-900 transition-all duration-200 flex flex-col shrink-0 ${
              isLogExpanded ? 'h-56' : 'h-8'
            }`}
          >
            {/* Thanh tiêu đề Error Log */}
            <div
              onClick={() => setIsLogExpanded(!isLogExpanded)}
              className="h-8 px-3 flex items-center justify-between cursor-pointer hover:bg-slate-800/60 select-none text-xs"
            >
              <div className="flex items-center space-x-2">
                <Terminal className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-slate-300">Nhật ký biên dịch (Logs)</span>
                {compileStatus === 'error' && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-semibold border border-rose-500/40">
                    Lỗi biên dịch
                  </span>
                )}
                {compileStatus === 'success' && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold border border-emerald-500/40">
                    Biên dịch thành công
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2 text-slate-400">
                <span className="text-[11px] text-slate-500">
                  {isLogExpanded ? 'Thu gọn' : 'Mở rộng'}
                </span>
                {isLogExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronUp className="w-4 h-4" />
                )}
              </div>
            </div>

            {/* Nội dung Log khi mở rộng */}
            {isLogExpanded && (
              <div className="flex-1 bg-slate-950 p-3 overflow-auto font-mono text-xs text-slate-300 select-text">
                {errorLogs ? (
                  <pre className="whitespace-pre-wrap break-words text-rose-300">
                    {errorLogs}
                  </pre>
                ) : (
                  <div className="text-slate-500 italic">
                    Không có thông báo lỗi nào. Quá trình biên dịch diễn ra trôi chảy.
                  </div>
                )}
              </div>
            )}
          </div>

        </section>

      </main>

    </div>
  );
}

// Bọc Component chính trong Suspense boundary để tuân thủ quy chuẩn Next.js App Router (useSearchParams)
export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
          <RotateCw className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
          <p className="text-sm font-medium">Đang khởi tạo LaTeX Studio...</p>
        </div>
      }
    >
      <LatexStudio />
    </Suspense>
  );
}
