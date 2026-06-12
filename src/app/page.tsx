'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [driveId, setDriveId] = useState('');
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (driveId.trim()) {
      // Basic check if the user inputted a full URL or just an ID
      let finalId = driveId.trim();
      if (finalId.includes('drive.google.com')) {
        const match = finalId.match(/folders\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
          finalId = match[1];
        } else {
          // another url format check just in case
          const idParam = new URLSearchParams(finalId.split('?')[1]).get('id');
          if (idParam) finalId = idParam;
        }
      }
      router.push(`/${finalId}`);
    }
  };

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 selection:bg-blue-500/30">
      <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-3xl shadow-2xl p-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>
        
        <h1 className="text-3xl font-bold text-white text-center mb-2">Snapme Photoshare</h1>
        <p className="text-gray-400 text-center mb-8">
          Enter your Google Drive Folder ID or Link to view the gallery.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="driveId" className="block text-sm font-medium text-gray-300 mb-1">
              Google Drive Folder
            </label>
            <input
              type="text"
              id="driveId"
              value={driveId}
              onChange={(e) => setDriveId(e.target.value)}
              placeholder="e.g. 1A2b3C4d5E6f7G8h9I0j"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5"
          >
            View Gallery
          </button>
        </form>
      </div>
      <div className="mt-8 text-center text-gray-500 text-sm">
        <p>Make sure the Google Drive folder is accessible to "Anyone with the link".</p>
      </div>
    </main>
  );
}
