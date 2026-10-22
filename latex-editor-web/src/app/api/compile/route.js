import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || (!body.code && !body.files)) {
      return NextResponse.json(
        { error: 'Lỗi yêu cầu', logs: 'Mã LaTeX không hợp lệ hoặc thiếu thuộc tính "code" / "files".' },
        { status: 400 }
      );
    }

    // Lấy URL compiler service từ biến môi trường
    const compilerBaseUrl = process.env.COMPILER_SERVICE_URL || process.env.NEXT_PUBLIC_COMPILER_URL || 'http://localhost:5000';
    const targetUrl = `${compilerBaseUrl.replace(/\/+$/, '')}/compile`;

    // Gọi chuyển tiếp request tới Compiler Service (hỗ trợ cả multi-file)
    let compilerResponse;
    try {
      compilerResponse = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: body.code,
          mainFile: body.mainFile || 'main.tex',
          files: body.files || {}
        }),
        signal: AbortSignal.timeout(45000), // Cho phép tối đa 45 giây (30s compile + overhead mạng)
      });
    } catch (fetchError) {
      console.error('[API Proxy Error] Không thể kết nối tới compiler service:', fetchError);
      return NextResponse.json(
        {
          error: 'Lỗi kết nối Compiler Service',
          logs: `Không thể kết nối tới dịch vụ biên dịch LaTeX tại địa chỉ: ${targetUrl}\nChi tiết lỗi: ${fetchError.message}\n\nHướng giải quyết:\n1. Kiểm tra xem docker container hoặc latex-compiler-service đã được khởi động chưa.\n2. Kiểm tra biến môi trường COMPILER_SERVICE_URL trên server/Vercel.`
        },
        { status: 502 }
      );
    }

    const contentType = compilerResponse.headers.get('content-type') || '';

    // Trường hợp biên dịch thành công (trả về PDF binary)
    if (compilerResponse.ok && contentType.includes('application/pdf')) {
      const pdfBuffer = await compilerResponse.arrayBuffer();

      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline; filename="document.pdf"',
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    }

    // Trường hợp lỗi biên dịch hoặc lỗi khác từ Compiler Service
    const errorData = await compilerResponse.json().catch(async () => {
      const rawText = await compilerResponse.text().catch(() => '');
      return { error: 'Lỗi biên dịch không xác định', logs: rawText };
    });

    return NextResponse.json(
      {
        error: errorData.error || 'Lỗi biên dịch LaTeX',
        logs: errorData.logs || 'Compiler service không trả về chi tiết log.'
      },
      { status: compilerResponse.status || 400 }
    );

  } catch (globalError) {
    console.error('[API Route Global Error]:', globalError);
    return NextResponse.json(
      {
        error: 'Lỗi máy chủ nội bộ',
        logs: globalError.message || 'Đã xảy ra sự cố không lường trước trên Next.js proxy.'
      },
      { status: 500 }
    );
  }
}
