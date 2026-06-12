'use client';

import { useState, useMemo, useEffect } from 'react';
import type { DriveFile } from '@/lib/drive';
import { getPhotosFromDrive } from '@/lib/drive';

function parseDateFromFilename(filename: string): Date | null {
  const match = filename.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (match) {
    const [, yyyy, MM, dd, hh, mm, ss] = match;
    return new Date(`${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}`);
  }
  return null;
}

function formatTime(date: Date | null): string {
  if (!date) return 'Unknown Time';
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
}

interface MediaGroup {
  title: string;
  items: DriveFile[];
  cover: DriveFile;
}

export default function Gallery({ initialPhotos, driveId }: { initialPhotos: DriveFile[], driveId: string }) {
  const [photos, setPhotos] = useState<DriveFile[]>(initialPhotos);
  const [selectedGroup, setSelectedGroup] = useState<MediaGroup | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<DriveFile | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-polling for new photos every 10 seconds
  useEffect(() => {
    if (!driveId) return;
    
    const interval = setInterval(async () => {
      try {
        const freshPhotos = await getPhotosFromDrive(driveId);
        // Jika ada perubahan jumlah file, perbarui data di layar
        if (freshPhotos.length !== photos.length) {
          setIsRefreshing(true);
          setPhotos(freshPhotos);
          setTimeout(() => setIsRefreshing(false), 2000);
        }
      } catch (err) {
        console.error('Auto-refresh failed:', err);
      }
    }, 10000); // 10 detik

    return () => clearInterval(interval);
  }, [driveId, photos.length]);

  // Group media based on Prints as the anchor
  const groupedMedia = useMemo(() => {
    if (!photos || photos.length === 0) return [];

    const prints = photos.filter(p => p.folderType === 'print');
    const originals = photos.filter(p => p.folderType === 'original');
    const animated = photos.filter(p => p.folderType === 'animated');

    // Jika belum ada struktur folder 3-subfolder, fallback ke logic lama (atau return empty)
    if (prints.length === 0 && originals.length === 0 && animated.length === 0) {
      // Fallback: anggap semua file adalah foto campur (backward compatibility)
      return []; // Untuk saat ini kita return kosong agar user tahu struktur foldernya harus benar
    }

    const getWithDates = (arr: DriveFile[]) => 
      arr.map(f => ({ file: f, date: parseDateFromFilename(f.name) }))
         .filter(x => x.date !== null)
         .sort((a,b) => a.date!.getTime() - b.date!.getTime());

    const printItems = getWithDates(prints);
    const originalItems = getWithDates(originals);
    const animatedItems = getWithDates(animated);

    const groups: MediaGroup[] = [];

    // Gunakan algoritma Centroid: Setiap Print adalah sebuah Sesi.
    printItems.forEach((printItem, index) => {
      const groupItems: DriveFile[] = [];
      const pTime = printItem.date!.getTime();

      // Tambahkan Print (sebagai kolase utama)
      groupItems.push(printItem.file);

      // Cari Originals yang jarak waktunya paling dekat dengan Print ini
      // dibanding dengan Print lainnya
      const matchedOriginals = originalItems.filter(orig => {
        const oTime = orig.date!.getTime();
        const distToThis = Math.abs(oTime - pTime);
        
        // Cek jarak orig ini ke semua print lain
        const isClosestToThis = printItems.every(otherPrint => {
          if (otherPrint === printItem) return true;
          return Math.abs(oTime - otherPrint.date!.getTime()) >= distToThis;
        });
        return isClosestToThis;
      });

      // Cari Animated yang jarak waktunya paling dekat dengan Print ini
      const matchedAnimated = animatedItems.filter(anim => {
        const aTime = anim.date!.getTime();
        const distToThis = Math.abs(aTime - pTime);
        
        const isClosestToThis = printItems.every(otherPrint => {
          if (otherPrint === printItem) return true;
          return Math.abs(aTime - otherPrint.date!.getTime()) >= distToThis;
        });
        return isClosestToThis;
      });

      // Gabungkan Originals dan Animated ke dalam grup ini
      matchedOriginals.forEach(o => groupItems.push(o.file));
      matchedAnimated.forEach(a => groupItems.push(a.file));

      // Beri judul sesi berdasarkan waktu Print
      const title = `Session ${index + 1} (${formatTime(printItem.date!)})`;
      
      groups.push({
        title,
        items: groupItems, // Isinya: 1 Print, bbrp Originals, 1 Animated
        cover: printItem.file // Cover selalu foto Print
      });
    });

    return groups.reverse(); // Terbaru di atas
  }, [photos]);

  const handleDownloadAll = () => {
    if (!selectedGroup || isDownloading) return;
    setIsDownloading(true);
    
    // Trigger downloads securely via Next.js Proxy API to avoid CORS and Frame blocks
    selectedGroup.items.forEach((item, index) => {
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = `/api/download?id=${item.id}&name=${encodeURIComponent(item.name)}`;
        link.download = item.name;
        link.target = '_blank'; // Tetap butuh _blank di HP tertentu
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        if (index === selectedGroup.items.length - 1) {
          setTimeout(() => setIsDownloading(false), 1500);
        }
      }, index * 800);
    });
  };

  if (!photos || photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <h2 className="text-2xl font-semibold text-gray-200">No media found</h2>
        <p className="text-gray-400 mt-2">Pastikan ID folder benar dan hak akses folder sudah diset Public.</p>
      </div>
    );
  }

  return (
    <>
      {/* MASTER VIEW: LIST OF SESSIONS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-6 p-2 sm:p-4">
        {groupedMedia.map((group, index) => {
          const isVideo = group.cover.mimeType.includes('video');
          const originalThumb = group.cover.thumbnailLink || '';
          const highResThumbnail = originalThumb ? originalThumb.replace('=s220', '=s1000') : '';
          const driveFallback = `https://drive.google.com/thumbnail?id=${group.cover.id}&sz=w800`;

          return (
            <div 
              key={index}
              onClick={() => setSelectedGroup(group)}
              className="group cursor-pointer bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden hover:border-blue-500/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-500/20"
            >
              <div className="aspect-[3/4] sm:aspect-square overflow-hidden relative">
                <img
                  src={highResThumbnail || driveFallback}
                  onError={(e) => { 
                    const current = e.currentTarget.src;
                    if (current.includes('=s1000') && originalThumb) {
                      e.currentTarget.src = originalThumb;
                    } else if (current === originalThumb || current.includes('=s220')) {
                      e.currentTarget.src = driveFallback;
                    }
                  }}
                  alt={group.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-90 group-hover:opacity-100"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-900/40 to-transparent"></div>
                <div className="absolute bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2">
                  <div>
                    <h3 className="text-sm sm:text-lg font-bold text-white mb-0.5 sm:mb-1">{group.title}</h3>
                    <p className="text-xs sm:text-sm text-gray-300 font-medium">{group.items.length} Files</p>
                  </div>
                  <div className="hidden sm:flex w-8 h-8 sm:w-10 sm:h-10 bg-blue-500/80 backdrop-blur text-white rounded-full items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* DETAIL VIEW MODAL */}
      {selectedGroup && (
        <div className="fixed inset-0 z-40 bg-gray-950 flex flex-col animate-fade-in">
          {/* Modal Header */}
          <div className="flex-none bg-gray-900/90 backdrop-blur-xl border-b border-gray-800 px-4 py-3 sm:px-6 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky top-0 z-10 shadow-lg">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setSelectedGroup(null)}
                className="p-1.5 sm:p-2 -ml-2 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white truncate max-w-[200px] sm:max-w-md">{selectedGroup.title}</h2>
                <p className="text-xs sm:text-sm text-gray-400">{selectedGroup.items.length} Files in this session</p>
              </div>
            </div>
            
            <button
              onClick={handleDownloadAll}
              disabled={isDownloading}
              className={`w-full sm:w-auto justify-center px-4 py-2 sm:px-5 sm:py-2.5 rounded-full font-semibold flex items-center gap-2 transition-all text-sm sm:text-base ${
                isDownloading 
                  ? 'bg-blue-600/50 text-white cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/30 hover:scale-105'
              }`}
            >
              {isDownloading ? (
                <>
                  <svg className="animate-spin w-4 h-4 sm:w-5 sm:h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Downloading...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download All
                </>
              )}
            </button>
          </div>

          {/* Modal Content (Files) */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-6">
            <div className="max-w-7xl mx-auto columns-2 sm:columns-3 lg:columns-4 gap-3 sm:gap-6 space-y-3 sm:space-y-6">
              {selectedGroup.items.map((media) => {
                const isVideo = media.mimeType.includes('video');
                const originalThumb = media.thumbnailLink || '';
                const highResThumbnail = originalThumb ? originalThumb.replace('=s220', '=s1000') : '';
                const driveFallback = `https://drive.google.com/thumbnail?id=${media.id}&sz=w800`;

                return (
                  <div 
                    key={media.id} 
                    className="break-inside-avoid relative group cursor-pointer overflow-hidden rounded-xl bg-gray-900 border border-gray-800 shadow-lg transform transition duration-300 hover:-translate-y-1 hover:shadow-blue-500/20 hover:border-blue-500/50"
                    onClick={() => setSelectedMedia(media)}
                  >
                    {isVideo ? (
                      <div className="relative bg-gray-900 aspect-[4/3] flex items-center justify-center">
                        <img
                          src={highResThumbnail || driveFallback}
                          onError={(e) => { 
                            const current = e.currentTarget.src;
                            if (current.includes('=s1000') && originalThumb) {
                              e.currentTarget.src = originalThumb;
                            } else if (current === originalThumb || current.includes('=s220')) {
                              e.currentTarget.src = driveFallback;
                            } else {
                              // Sembunyikan icon broken image jika semua sumber thumbnail gagal dimuat
                              e.currentTarget.style.opacity = '0';
                            }
                          }}
                          alt={media.name}
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-50"
                        />
                        <div className="absolute inset-0 flex items-center justify-center z-10">
                          <div className="bg-black/60 p-4 rounded-full backdrop-blur-sm group-hover:bg-blue-600 transition-colors">
                            <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M4 4l12 6-12 6z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <img
                        src={highResThumbnail || driveFallback}
                        onError={(e) => { 
                          const current = e.currentTarget.src;
                          if (current.includes('=s1000') && originalThumb) {
                            e.currentTarget.src = originalThumb;
                          } else if (current === originalThumb || current.includes('=s220')) {
                            e.currentTarget.src = driveFallback;
                          }
                        }}
                        alt={media.name}
                        loading="lazy"
                        className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX FOR INDIVIDUAL MEDIA */}
      {selectedMedia && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-2 sm:p-4 backdrop-blur-2xl animate-fade-in"
          onClick={() => setSelectedMedia(null)}
        >
          <div className="relative w-full max-w-5xl h-full sm:h-auto max-h-full flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
            <button 
              className="absolute top-4 right-4 sm:-top-12 sm:right-0 bg-black/50 sm:bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition-colors backdrop-blur-md z-50"
              onClick={() => setSelectedMedia(null)}
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {selectedMedia.mimeType.includes('video') ? (
              <video 
                controls 
                autoPlay 
                playsInline
                src={`/api/download?id=${selectedMedia.id}&name=${encodeURIComponent(selectedMedia.name)}`} 
                className="w-full max-w-4xl max-h-[70vh] sm:max-h-[80vh] rounded-xl shadow-2xl bg-black"
              />
            ) : (
              <img
                src={selectedMedia.thumbnailLink ? selectedMedia.thumbnailLink.replace('=s220', '=s2000') : `https://drive.google.com/uc?export=view&id=${selectedMedia.id}`}
                onError={(e) => { e.currentTarget.src = `https://drive.google.com/uc?export=view&id=${selectedMedia.id}`; }}
                alt={selectedMedia.name}
                className="max-w-full max-h-[70vh] sm:max-h-[80vh] object-contain rounded-xl shadow-2xl"
              />
            )}

            <div className="mt-4 sm:mt-6 flex w-full sm:w-auto px-4 sm:px-0">
              <a 
                href={`/api/download?id=${selectedMedia.id}&name=${encodeURIComponent(selectedMedia.name)}`}
                className="w-full sm:w-auto justify-center px-4 py-2.5 sm:px-6 sm:py-3 bg-white hover:bg-gray-200 text-gray-900 font-bold rounded-full transition-all flex items-center gap-2 shadow-xl transform sm:hover:scale-105 text-sm sm:text-base"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Original
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
