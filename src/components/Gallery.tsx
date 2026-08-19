'use client';

import { useState, useMemo, useEffect } from 'react';
import type { DriveFile } from '@/lib/drive';
import { getPhotosFromDrive } from '@/lib/drive';

function parseDateFromFilename(filename: string): Date | null {
  // Menghilangkan tanda '^' di awal agar bisa membaca file dengan awalan seperti "IMG_3855_"
  const match = filename.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
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

function getProperFilename(name: string, mimeType: string): string {
  const hasExtension = /\.[a-zA-Z0-9]{3,4}$/.test(name);
  if (hasExtension) return name;
  
  let ext = '';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = '.jpg';
  else if (mimeType.includes('mp4') || mimeType.includes('video')) ext = '.mp4';
  else if (mimeType.includes('gif')) ext = '.gif';
  else if (mimeType.includes('png')) ext = '.png';
  
  return name + ext;
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
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | 'none'>('none');
  const [isDownloading, setIsDownloading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
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

  const handleDownloadAll = async () => {
    if (!selectedGroup || isDownloading) return;
    
    // Gunakan Web Share API khusus untuk iOS karena iOS memblokir multiple downloads
    let canUseShare = false;
    if (navigator.canShare) {
      try {
        const dummyFile = new File([''], 'test.txt', { type: 'text/plain' });
        canUseShare = navigator.canShare({ files: [dummyFile] });
      } catch (e) {
        canUseShare = false;
      }
    }
    
    // Deteksi iOS (iPhone/iPad/iPod)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (canUseShare && isIOS) {
      setIsDownloading(true);
      setToastMessage("Preparing files...");
      try {
        const files: File[] = [];
        for (const item of selectedGroup.items) {
          const properName = getProperFilename(item.name, item.mimeType);
          const res = await fetch(`/api/download?id=${item.id}&name=${encodeURIComponent(properName)}&mimeType=${encodeURIComponent(item.mimeType)}`);
          const blob = await res.blob();
          files.push(new File([blob], properName, { type: item.mimeType }));
        }

        await navigator.share({
          title: selectedGroup.title,
          files: files
        });
        setToastMessage("Success: Opened Share Menu");
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error("Error sharing files:", err);
          setToastMessage("Error: Failed to prepare files");
        } else {
           setToastMessage(null); // User cancelled share
        }
      } finally {
        setIsDownloading(false);
        setTimeout(() => setToastMessage(null), 3000);
      }
      return;
    }

    // Fallback untuk Android / PC (Logic lama)
    setIsDownloading(true);
    selectedGroup.items.forEach((item, index) => {
      setTimeout(() => {
        const properName = getProperFilename(item.name, item.mimeType);
        const link = document.createElement('a');
        link.href = `/api/download?id=${item.id}&name=${encodeURIComponent(properName)}&mimeType=${encodeURIComponent(item.mimeType)}`;
        link.download = properName;
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

  // === Swipe Handling Logic ===
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };
  const onTouchMove = (e: React.TouchEvent) => setTouchEnd(e.targetTouches[0].clientX);
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd || !selectedGroup || !selectedMedia) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    const currentIndex = selectedGroup.items.findIndex(m => m.id === selectedMedia.id);
    if (isLeftSwipe && currentIndex < selectedGroup.items.length - 1) {
      setSlideDirection('right');
      setSelectedMedia(selectedGroup.items[currentIndex + 1]);
    }
    if (isRightSwipe && currentIndex > 0) {
      setSlideDirection('left');
      setSelectedMedia(selectedGroup.items[currentIndex - 1]);
    }
  };

  // === Session Navigation Logic ===
  const currentGroupIdx = groupedMedia.findIndex(g => g.title === selectedGroup?.title);
  const hasPrevGroup = currentGroupIdx > 0;
  const hasNextGroup = currentGroupIdx !== -1 && currentGroupIdx < groupedMedia.length - 1;

  const goPrevGroup = () => {
    if (hasPrevGroup) {
      const group = groupedMedia[currentGroupIdx - 1];
      setSelectedGroup(group);
      setSelectedMedia(group.cover);
    }
  };
  const goNextGroup = () => {
    if (hasNextGroup) {
      const group = groupedMedia[currentGroupIdx + 1];
      setSelectedGroup(group);
      setSelectedMedia(group.cover);
    }
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
              onClick={() => {
                setSelectedGroup(group);
                setSelectedMedia(group.cover);
              }}
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

      {/* FOCUS VIEW MODAL (Session Details) */}
      {selectedGroup && selectedMedia && (
        <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col animate-fade-in">
          {/* Header */}
          <div className="flex-none bg-gray-900/90 backdrop-blur-xl border-b border-gray-800 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between z-10 shadow-lg relative">
            <button 
              onClick={() => {
                setSelectedGroup(null);
                setSelectedMedia(null);
                setSlideDirection('none');
              }}
              className="p-1.5 sm:p-2 -ml-2 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition-colors relative z-10"
            >
              <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>

            {/* Centered Title Area */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-2 sm:gap-4 pointer-events-auto">
                {/* Prev Session Button */}
                <button 
                  onClick={goPrevGroup} 
                  disabled={!hasPrevGroup} 
                  className="p-1.5 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Previous Session"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <div className="text-center px-1">
                  <h2 className="text-base sm:text-xl font-bold text-white truncate max-w-[130px] sm:max-w-[200px]">{selectedGroup.title}</h2>
                  <p className="text-[10px] sm:text-xs text-gray-400">{selectedGroup.items.length} Files in session</p>
                </div>

                {/* Next Session Button */}
                <button 
                  onClick={goNextGroup} 
                  disabled={!hasNextGroup} 
                  className="p-1.5 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Next Session"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Empty div for right-side balance */}
            <div className="w-8 sm:w-10"></div>
          </div>

          {/* Main Preview Area */}
          <div 
            className="flex-1 relative flex items-center justify-center p-4 overflow-hidden bg-black/50"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {/* Absolute Action Buttons (Bottom Right) */}
            <div className="absolute bottom-4 right-4 z-20 flex gap-2">
              <button 
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: 'Snapme Photoshare',
                      text: 'Check out this photo/video!',
                      url: window.location.href,
                    }).catch((error) => console.error('Error sharing', error));
                  } else {
                    navigator.clipboard.writeText(window.location.href);
                    alert("Link copied to clipboard!");
                  }
                }}
                title="Share"
                className="bg-gray-900/80 hover:bg-gray-800 backdrop-blur-md text-white p-2.5 sm:p-3 rounded-full shadow-lg transition-transform hover:scale-105 border border-gray-700/50"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
              <button 
                onClick={async () => {
                  setToastMessage("Downloading...");
                  try {
                    const properName = getProperFilename(selectedMedia.name, selectedMedia.mimeType);
                    const res = await fetch(`/api/download?id=${selectedMedia.id}&name=${encodeURIComponent(properName)}&mimeType=${encodeURIComponent(selectedMedia.mimeType)}`);
                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = properName;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    setToastMessage("Success: Downloaded!");
                  } catch (e) {
                    setToastMessage("Error: Download failed");
                  }
                  setTimeout(() => setToastMessage(null), 3000);
                }}
                title="Download Original"
                className="bg-blue-600/90 hover:bg-blue-500 backdrop-blur-md text-white p-2.5 sm:p-3 rounded-full shadow-lg transition-transform hover:scale-105 border border-blue-500/50"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            </div>

            {/* Media Player/Viewer wrapped with animation */}
            <div 
              key={selectedMedia.id}
              className={`w-full h-full flex items-center justify-center ${slideDirection === 'right' ? 'animate-slide-right' : slideDirection === 'left' ? 'animate-slide-left' : 'animate-fade-in'}`}
              onAnimationEnd={() => setSlideDirection('none')}
            >
              {selectedMedia.mimeType.includes('video') ? (
                <video 
                  controls 
                  autoPlay 
                  playsInline
                  src={`/api/download?id=${selectedMedia.id}&name=${encodeURIComponent(getProperFilename(selectedMedia.name, selectedMedia.mimeType))}&mimeType=${encodeURIComponent(selectedMedia.mimeType)}`} 
                  className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                />
              ) : (
                <img
                  src={selectedMedia.thumbnailLink ? selectedMedia.thumbnailLink.replace('=s220', '=s2000') : `https://drive.google.com/uc?export=view&id=${selectedMedia.id}`}
                  onError={(e) => { e.currentTarget.src = `https://drive.google.com/uc?export=view&id=${selectedMedia.id}`; }}
                  alt={selectedMedia.name}
                  className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                />
              )}
            </div>
          </div>

          {/* Thumbnail Strip & Action Footer */}
          <div className="flex-none bg-gray-900 border-t border-gray-800 flex flex-col">
            {/* Thumbnail Strip */}
            <div className="flex overflow-x-auto gap-3 p-4 items-center no-scrollbar">
              {selectedGroup.items.map((media) => {
                const isVideo = media.mimeType.includes('video');
                const originalThumb = media.thumbnailLink || '';
                const highResThumbnail = originalThumb ? originalThumb.replace('=s220', '=s400') : '';
                const driveFallback = `https://drive.google.com/thumbnail?id=${media.id}&sz=w400`;
                const isActive = selectedMedia.id === media.id;

                return (
                  <button
                    key={media.id}
                    onClick={() => {
                      const currentIndex = selectedGroup.items.findIndex(m => m.id === selectedMedia.id);
                      const newIndex = selectedGroup.items.findIndex(m => m.id === media.id);
                      setSlideDirection(newIndex > currentIndex ? 'right' : newIndex < currentIndex ? 'left' : 'none');
                      setSelectedMedia(media);
                    }}
                    className={`flex-none relative w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden transition-all duration-300 ${isActive ? 'ring-4 ring-blue-500 scale-105' : 'opacity-60 hover:opacity-100 hover:scale-105'}`}
                  >
                    {isVideo && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30">
                        <svg className="w-8 h-8 text-white drop-shadow-md" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M4 4l12 6-12 6z" />
                        </svg>
                      </div>
                    )}
                    <img
                      src={highResThumbnail || driveFallback}
                      onError={(e) => { e.currentTarget.src = driveFallback; }}
                      alt={media.name}
                      className="w-full h-full object-cover"
                    />
                  </button>
                );
              })}
            </div>

            {/* Download All Footer */}
            <div className="p-4 border-t border-gray-800 bg-gray-950">
              <button
                onClick={handleDownloadAll}
                disabled={isDownloading}
                className={`w-full py-3 sm:py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all text-base sm:text-lg ${
                  isDownloading 
                    ? 'bg-blue-600/50 text-white cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                }`}
              >
                {isDownloading ? (
                  <>
                    <svg className="animate-spin w-5 h-5 sm:w-6 sm:h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Downloading...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download All Session Files
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* LIGHTBOX FOR INDIVIDUAL MEDIA */}
      {/* ... Lightbox removed ... */}

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed top-12 left-1/2 transform -translate-x-1/2 z-[100] bg-gray-900/90 backdrop-blur-lg text-white px-5 py-3 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.5)] border border-gray-700 animate-fade-in flex items-center gap-3 font-medium text-sm sm:text-base transition-all">
          {toastMessage === 'Downloading...' ? (
            <svg className="animate-spin w-5 h-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : toastMessage.includes('Success') ? (
            <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : null}
          {toastMessage.replace('Success: ', '').replace('Error: ', '')}
        </div>
      )}
    </>
  );
}
