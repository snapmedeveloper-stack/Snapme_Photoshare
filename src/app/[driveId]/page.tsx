import { getPhotosFromDrive } from '@/lib/drive';
import Gallery from '@/components/Gallery';

export const revalidate = 60; // Revalidate the data every 60 seconds

export default async function DriveGalleryPage({ params }: { params: Promise<{ driveId: string }> }) {
  const resolvedParams = await params;
  const { driveId } = resolvedParams;

  let photos: any[] = [];
  let error = null;

  try {
    photos = await getPhotosFromDrive(driveId);
  } catch (e: any) {
    error = e.message;
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white selection:bg-blue-500/30">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-gray-950/80 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Snapme Photoshare
          </h1>
          <div className="text-sm text-gray-400">
            {photos.length} Photos
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto py-8">
        {error ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-gray-200">Failed to load photos</h2>
            <p className="text-gray-400 mt-2 max-w-md">{error}</p>
          </div>
        ) : (
          <Gallery initialPhotos={photos} driveId={driveId} />
        )}
      </div>
    </main>
  );
}
