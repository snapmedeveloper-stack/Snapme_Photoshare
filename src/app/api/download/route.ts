import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');
  const filename = searchParams.get('name') || 'download';
  const mimeType = searchParams.get('mimeType');

  if (!id) {
    return new NextResponse('Missing file ID', { status: 400 });
  }

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) {
    return new NextResponse('Server Configuration Error', { status: 500 });
  }

  const url = `https://drive.google.com/uc?export=download&id=${id}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errText = await response.text();
      console.error(`Google Drive download failed. Status: ${response.status}, Error: ${errText}`);
      throw new Error(`Google Drive download returned ${response.status}`);
    }

    const responseContentType = response.headers.get('Content-Type');
    const finalContentType = mimeType || (responseContentType && responseContentType !== 'application/octet-stream' ? responseContentType : 'application/octet-stream');
    const contentLength = response.headers.get('Content-Length');

    const headers: Record<string, string> = {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': finalContentType,
    };
    
    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }

    // Proxy the stream to the client
    return new NextResponse(response.body, { headers });
  } catch (error) {
    console.error('Download Proxy Error:', error);
    return new NextResponse('Failed to download file', { status: 500 });
  }
}
