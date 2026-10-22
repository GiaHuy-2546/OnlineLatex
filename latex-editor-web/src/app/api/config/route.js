import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Lấy URL của backend từ biến môi trường trên Vercel / server
  const compilerUrl = process.env.COMPILER_SERVICE_URL || process.env.NEXT_PUBLIC_COMPILER_URL || 'http://localhost:5000';
  
  // Chuyển đổi http/https sang ws/wss cho kết nối WebSocket Signaling
  const cleanUrl = compilerUrl.replace(/\/+$/, '');
  const signalingUrl = cleanUrl
    .replace(/^http:\/\//i, 'ws://')
    .replace(/^https:\/\//i, 'wss://');

  return NextResponse.json({
    compilerUrl: cleanUrl,
    signalingUrl: signalingUrl,
  }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    }
  });
}
