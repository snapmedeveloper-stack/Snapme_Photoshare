'use server';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webContentLink?: string;
  folderType?: 'animated' | 'print' | 'original';
}

export async function getPhotosFromDrive(folderId: string): Promise<DriveFile[]> {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) {
    throw new Error('Google Drive API Key is not configured');
  }

  // 1. Fetch the subfolders inside the root folder
  const foldersRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id,name)&key=${apiKey}`
  );
  const foldersData = await foldersRes.json();
  const subfolders = foldersData.files || [];

  const animatedFolder = subfolders.find((f: any) => f.name.toLowerCase().includes('animated'));
  const printsFolder = subfolders.find((f: any) => f.name.toLowerCase().includes('print'));
  const originalsFolder = subfolders.find((f: any) => f.name.toLowerCase().includes('original'));

  const allFiles: DriveFile[] = [];

  // Helper to fetch files from a specific folder and tag them
  const fetchFromFolder = async (fId: string | undefined, type: 'animated' | 'print' | 'original') => {
    if (!fId) return;
    try {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${fId}'+in+parents+and+mimeType!='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id,name,mimeType,thumbnailLink,webContentLink)&pageSize=1000&key=${apiKey}`
      );
      const data = await res.json();
      if (data.files) {
        let taggedFiles = data.files.map((file: any) => ({
          ...file,
          folderType: type
        }));

        // Abaikan file .jpg di dalam folder Animated
        if (type === 'animated') {
          taggedFiles = taggedFiles.filter((f: any) => !f.mimeType.includes('image'));
        }

        allFiles.push(...taggedFiles);
      }
    } catch (err) {
      console.error(`Error fetching from ${type} folder:`, err);
    }
  };

  // 2. Fetch from all 3 folders in parallel
  await Promise.all([
    fetchFromFolder(animatedFolder?.id, 'animated'),
    fetchFromFolder(printsFolder?.id, 'print'),
    fetchFromFolder(originalsFolder?.id, 'original')
  ]);

  return allFiles;
}
