import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get('id');
  const filename = searchParams.get('name') || 'download';

  if (!id) {
    return new NextResponse('Missing file ID', { status: 400 });
  }

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) {
    return new NextResponse('Server Configuration Error', { status: 500 });
  }

  const url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Google Drive API returned ${response.status}`);
    }

    // Proxy the stream to the client
    return new NextResponse(response.body, {
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
      },
    });
  } catch (error) {
    console.error('Download Proxy Error:', error);
    return new NextResponse('Failed to download file', { status: 500 });
  }
}
