import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, addDoc, query, where, getCountFromServer } from 'firebase/firestore';
import { ImageIcon, X, Search, Copy, Check, Upload } from 'lucide-react';

interface MediaLibraryModalProps {
  onSelect: (url: string) => void;
  onClose: () => void;
}

export const MediaLibraryModal: React.FC<MediaLibraryModalProps> = ({ onSelect, onClose }) => {
  const [media, setMedia] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMedia() {
      const snap = await getDocs(collection(db, 'siteMedia'));
      setMedia(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }
    loadMedia();
  }, []);

  const filteredMedia = media.filter(m => m.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-3xl max-w-4xl w-full p-6 max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-black">Choose from Library</h2>
          <button onClick={onClose}><X className="w-6 h-6" /></button>
        </div>
        <input 
            type="text" 
            placeholder="Search images..." 
            className="w-full p-3 rounded-xl border border-slate-200 mb-4"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-4 gap-4">
          {filteredMedia.map(m => (
            <button key={m.id} onClick={() => onSelect(m.url)} className="border border-slate-200 rounded-xl overflow-hidden p-2 hover:border-blue-500">
              <img src={m.url} alt={m.name} className="w-full h-24 object-cover rounded-lg" />
              <div className="text-xs truncate mt-2">{m.name}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
