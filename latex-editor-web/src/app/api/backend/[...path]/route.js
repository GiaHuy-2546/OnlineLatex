import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function handleProxy(request, { params }) {
  try {
    const pathParts = params.path || [];
    const subPath = pathParts.join('/');

    const compilerBaseUrl = process.env.COMPILER_SERVICE_URL || process.env.NEXT_PUBLIC_COMPILER_URL || 'http://localhost:5000';
    const targetUrl = `${compilerBaseUrl.replace(/\/+$/, '')}/api/${subPath}`;

    const headers = {
      'Content-Type': 'application/json',
    };

    const auth = request.headers.get('authorization');
    if (auth) headers['Authorization'] = auth;

    const method = request.method;
    let body = undefined;

    if (method !== 'GET' && method !== 'HEAD') {
      body = await request.text();
    }

    const response = await fetch(targetUrl, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json().catch(async () => {
      const text = await response.text().catch(() => '');
      return { raw: text };
    });

    return NextResponse.json(data, {
      status: response.status,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      }
    });

  } catch (err) {
    console.error('[Backend Proxy Error]:', err);
    return NextResponse.json(
      { error: 'Lỗi kết nối tới Backend Service', details: err.message },
      { status: 502 }
    );
  }
}

export { handleProxy as GET, handleProxy as POST, handleProxy as PUT, handleProxy as DELETE };
