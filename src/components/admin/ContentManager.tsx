import React, { useEffect, useState } from 'react';
import { db, storage } from '../../lib/firebase';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { Lesson, VideoLesson, CategoryItem } from '../../types';
import Papa from 'papaparse';
import {
  BookOpen,
  Video,
  Plus,
  Trash2,
  Edit2,
  Upload,
  Eye,
  EyeOff,
  Search,
  Tag,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  X,
  FileSpreadsheet,
  Image as ImageIcon,
  Play,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { ConfirmModal } from '../common/ConfirmModal';

export const extractYouTubeId = (url: string): string | null => {
  if (!url) return null;
  const trimmed = url.trim();
  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/;
  const match = trimmed.match(regExp);
  if (match && match[1]) {
    return match[1];
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
};

const DEFAULT_CATEGORIES = [
  'Speed Limits & Overtaking',
  'Traffic Signs & Signals',
  'Right of Way & Priorities',
  'Road Markings & Lanes',
  'Vehicle Lighting & Equipment',
  'Accident Prevention & First Aid',
  'Driver Behavior & General Rules',
];

export const ContentManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'lessons' | 'videos'>('lessons');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [videos, setVideos] = useState<VideoLesson[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Lesson Modals & Form
  const [isLessonModalOpen, setIsLessonModalOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [lessonToDelete, setLessonToDelete] = useState<Lesson | null>(null);

  const [lessonTitleEn, setLessonTitleEn] = useState('');
  const [lessonTitleRw, setLessonTitleRw] = useState('');
  const [lessonTitleFr, setLessonTitleFr] = useState('');
  const [lessonBodyEn, setLessonBodyEn] = useState('');
  const [lessonBodyRw, setLessonBodyRw] = useState('');
  const [lessonBodyFr, setLessonBodyFr] = useState('');
  const [lessonCategory, setLessonCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [lessonGazetteRef, setLessonGazetteRef] = useState('');
  const [lessonOrder, setLessonOrder] = useState(1);
  const [lessonPublished, setLessonPublished] = useState(true);
  const [lessonFreePreview, setLessonFreePreview] = useState(false);
  const [lessonImages, setLessonImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Video Modals & Form
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<VideoLesson | null>(null);
  const [videoToDelete, setVideoToDelete] = useState<VideoLesson | null>(null);

  const [videoTitleEn, setVideoTitleEn] = useState('');
  const [videoTitleRw, setVideoTitleRw] = useState('');
  const [videoTitleFr, setVideoTitleFr] = useState('');
  const [videoDescEn, setVideoDescEn] = useState('');
  const [videoDescRw, setVideoDescRw] = useState('');
  const [videoDescFr, setVideoDescFr] = useState('');
  const [videoCategory, setVideoCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [videoYoutubeUrl, setVideoYoutubeUrl] = useState('');
  const [videoOrder, setVideoOrder] = useState(1);
  const [videoPublished, setVideoPublished] = useState(true);
  const [videoFreePreview, setVideoFreePreview] = useState(false);

  // Categories Management Modal
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');

  // Bulk Import Modal (Lessons)
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [, setBulkCsvFile] = useState<File | null>(null);
  const [bulkImageFiles, setBulkImageFiles] = useState<FileList | null>(null);
  const [parsedPreview, setParsedPreview] = useState<any[]>([]);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Fetch all content
  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Categories
      const catSnap = await getDocs(collection(db, 'categories')).catch((err) => {
        handleFirestoreError(err, OperationType.LIST, 'categories');
        return null;
      });
      if (catSnap && !catSnap.empty) {
        const catList = catSnap.docs.map((d) => {
          const data = d.data();
          const nameStr = typeof data.name === 'object' ? data.name.en || data.name.rw || 'General' : data.name || 'General';
          return { id: d.id, name: nameStr, order: data.order || 0 };
        });
        catList.sort((a, b) => (a.order || 0) - (b.order || 0));
        setCategories(catList);
      } else {
        // Seed default categories if none exist in Firestore
        const seeded: CategoryItem[] = [];
        for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
          const name = DEFAULT_CATEGORIES[i];
          const docRef = await addDoc(collection(db, 'categories'), {
            name,
            order: i + 1,
            createdAt: serverTimestamp(),
          });
          seeded.push({ id: docRef.id, name, order: i + 1 });
        }
        setCategories(seeded);
      }

      // 2. Lessons
      const lSnap = await getDocs(query(collection(db, 'lessons'), orderBy('order', 'asc'))).catch((err) => {
        handleFirestoreError(err, OperationType.LIST, 'lessons');
        return null;
      });
      if (lSnap) {
        setLessons(lSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Lesson)));
      }

      // 3. Videos
      const vSnap = await getDocs(query(collection(db, 'videos'), orderBy('order', 'asc'))).catch((err) => {
        handleFirestoreError(err, OperationType.LIST, 'videos');
        return null;
      });
      if (vSnap) {
        setVideos(vSnap.docs.map((d) => ({ id: d.id, ...d.data() } as VideoLesson)));
      }
    } catch (err) {
      console.error('Error fetching content:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const categoryOptions = categories.map((c) => (typeof c.name === 'string' ? c.name : (c.name as any).en || 'Category'));

  // ==========================================
  // LESSON HANDLERS
  // ==========================================
  const handleOpenAddLesson = () => {
    setEditingLesson(null);
    setLessonTitleEn('');
    setLessonTitleRw('');
    setLessonTitleFr('');
    setLessonBodyEn('');
    setLessonBodyRw('');
    setLessonBodyFr('');
    setLessonCategory(categoryOptions[0] || 'Traffic Rules');
    setLessonGazetteRef('');
    setLessonOrder(lessons.length + 1);
    setLessonPublished(true);
    setLessonFreePreview(false);
    setLessonImages([]);
    setIsLessonModalOpen(true);
  };

  const handleOpenEditLesson = (lesson: Lesson) => {
    setEditingLesson(lesson);
    setLessonTitleEn(lesson.title?.en || '');
    setLessonTitleRw(lesson.title?.rw || '');
    setLessonTitleFr(lesson.title?.fr || '');
    setLessonBodyEn(lesson.body?.en || '');
    setLessonBodyRw(lesson.body?.rw || '');
    setLessonBodyFr(lesson.body?.fr || '');
    setLessonCategory(lesson.category || categoryOptions[0] || 'Traffic Rules');
    setLessonGazetteRef(lesson.gazetteReference || '');
    setLessonOrder(lesson.order || 1);
    setLessonPublished(lesson.isPublished);
    setLessonFreePreview(Boolean(lesson.isFreePreview));
    setLessonImages(lesson.images || []);
    setIsLessonModalOpen(true);
  };

  const handleUploadLessonImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingImage(true);
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const storageRef = ref(storage, `lessons_images/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        urls.push(url);
      }
      setLessonImages((prev) => [...prev, ...urls]);
    } catch (err) {
      console.error('Error uploading image to storage:', err);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveLessonImage = (idxToRemove: number) => {
    setLessonImages((prev) => prev.filter((_, i) => i !== idxToRemove));
  };

  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    const lessonData: Omit<Lesson, 'id'> = {
      title: {
        en: lessonTitleEn || lessonTitleRw || lessonTitleFr,
        rw: lessonTitleRw || lessonTitleEn,
        fr: lessonTitleFr || lessonTitleEn,
      },
      body: {
        en: lessonBodyEn || lessonBodyRw,
        rw: lessonBodyRw || lessonBodyEn,
        fr: lessonBodyFr || lessonBodyEn,
      },
      category: lessonCategory,
      gazetteReference: lessonGazetteRef.trim() || undefined,
      images: lessonImages,
      order: Number(lessonOrder) || 1,
      isPublished: lessonPublished,
      isFreePreview: lessonFreePreview,
      updatedAt: new Date().toISOString(),
    };

    try {
      if (editingLesson) {
        await updateDoc(doc(db, 'lessons', editingLesson.id), lessonData);
        setLessons((prev) =>
          prev.map((l) => (l.id === editingLesson.id ? { ...l, ...lessonData } : l))
        );
      } else {
        const docRef = await addDoc(collection(db, 'lessons'), {
          ...lessonData,
          createdAt: serverTimestamp(),
        });
        setLessons((prev) => [...prev, { id: docRef.id, ...lessonData, createdAt: new Date().toISOString() }]);
      }
      setIsLessonModalOpen(false);
    } catch (err) {
      console.error('Error saving lesson:', err);
      handleFirestoreError(err, editingLesson ? OperationType.UPDATE : OperationType.CREATE, 'lessons');
    }
  };

  const handleDeleteLesson = async () => {
    if (!lessonToDelete) return;
    try {
      await deleteDoc(doc(db, 'lessons', lessonToDelete.id));
      setLessons((prev) => prev.filter((l) => l.id !== lessonToDelete.id));
      setLessonToDelete(null);
    } catch (err) {
      console.error('Error deleting lesson:', err);
      handleFirestoreError(err, OperationType.DELETE, `lessons/${lessonToDelete.id}`);
    }
  };

  const handleToggleLessonPublished = async (lesson: Lesson) => {
    const newStatus = !lesson.isPublished;
    try {
      await updateDoc(doc(db, 'lessons', lesson.id), {
        isPublished: newStatus,
        updatedAt: serverTimestamp(),
      });
      setLessons((prev) => prev.map((l) => (l.id === lesson.id ? { ...l, isPublished: newStatus } : l)));
    } catch (err) {
      console.error('Error toggling status:', err);
    }
  };

  const handleMoveLesson = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= filteredLessons.length) return;

    const currentItem = filteredLessons[index];
    const targetItem = filteredLessons[targetIndex];

    const currentOrder = currentItem.order ?? (index + 1);
    const targetOrder = targetItem.order ?? (targetIndex + 1);

    try {
      await updateDoc(doc(db, 'lessons', currentItem.id), { order: targetOrder, updatedAt: serverTimestamp() });
      await updateDoc(doc(db, 'lessons', targetItem.id), { order: currentOrder, updatedAt: serverTimestamp() });

      setLessons((prev) => {
        const updated = prev.map((l) => {
          if (l.id === currentItem.id) return { ...l, order: targetOrder };
          if (l.id === targetItem.id) return { ...l, order: currentOrder };
          return l;
        });
        return [...updated].sort((a, b) => (a.order || 0) - (b.order || 0));
      });
    } catch (err) {
      console.error('Error reordering lessons:', err);
    }
  };

  // ==========================================
  // VIDEO HANDLERS
  // ==========================================
  const youtubeIdFromUrl = extractYouTubeId(videoYoutubeUrl);

  const handleOpenAddVideo = () => {
    setEditingVideo(null);
    setVideoTitleEn('');
    setVideoTitleRw('');
    setVideoTitleFr('');
    setVideoDescEn('');
    setVideoDescRw('');
    setVideoDescFr('');
    setVideoCategory(categoryOptions[0] || 'Traffic Rules');
    setVideoYoutubeUrl('');
    setVideoOrder(videos.length + 1);
    setVideoPublished(true);
    setVideoFreePreview(false);
    setIsVideoModalOpen(true);
  };

  const handleOpenEditVideo = (v: VideoLesson) => {
    setEditingVideo(v);
    setVideoTitleEn(v.title?.en || '');
    setVideoTitleRw(v.title?.rw || '');
    setVideoTitleFr(v.title?.fr || '');
    setVideoDescEn(v.description?.en || '');
    setVideoDescRw(v.description?.rw || '');
    setVideoDescFr(v.description?.fr || '');
    setVideoCategory(v.category || categoryOptions[0] || 'Traffic Rules');
    setVideoYoutubeUrl(v.youtubeUrl || '');
    setVideoOrder(v.order || 1);
    setVideoPublished(v.isPublished);
    setVideoFreePreview(Boolean(v.isFreePreview));
    setIsVideoModalOpen(true);
  };

  const handleSaveVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    const vidId = extractYouTubeId(videoYoutubeUrl);
    if (!vidId) {
      alert('Please enter a valid YouTube link (e.g. https://www.youtube.com/watch?v=... or https://youtu.be/...)');
      return;
    }

    const thumbnail = `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`;

    const videoData: Omit<VideoLesson, 'id'> = {
      title: {
        en: videoTitleEn || videoTitleRw || videoTitleFr,
        rw: videoTitleRw || videoTitleEn,
        fr: videoTitleFr || videoTitleEn,
      },
      description: {
        en: videoDescEn || videoDescRw || '',
        rw: videoDescRw || videoDescEn || '',
        fr: videoDescFr || videoDescEn || '',
      },
      category: videoCategory,
      youtubeUrl: videoYoutubeUrl.trim(),
      youtubeVideoId: vidId,
      thumbnail,
      order: Number(videoOrder) || 1,
      isPublished: videoPublished,
      isFreePreview: videoFreePreview,
      updatedAt: new Date().toISOString(),
    };

    try {
      if (editingVideo) {
        await updateDoc(doc(db, 'videos', editingVideo.id), videoData);
        setVideos((prev) =>
          prev.map((v) => (v.id === editingVideo.id ? { ...v, ...videoData } : v))
        );
      } else {
        const docRef = await addDoc(collection(db, 'videos'), {
          ...videoData,
          createdAt: serverTimestamp(),
        });
        setVideos((prev) => [...prev, { id: docRef.id, ...videoData, createdAt: new Date().toISOString() }]);
      }
      setIsVideoModalOpen(false);
    } catch (err) {
      console.error('Error saving video:', err);
      handleFirestoreError(err, editingVideo ? OperationType.UPDATE : OperationType.CREATE, 'videos');
    }
  };

  const handleDeleteVideo = async () => {
    if (!videoToDelete) return;
    try {
      await deleteDoc(doc(db, 'videos', videoToDelete.id));
      setVideos((prev) => prev.filter((v) => v.id !== videoToDelete.id));
      setVideoToDelete(null);
    } catch (err) {
      console.error('Error deleting video:', err);
      handleFirestoreError(err, OperationType.DELETE, `videos/${videoToDelete.id}`);
    }
  };

  const handleToggleVideoPublished = async (v: VideoLesson) => {
    const newStatus = !v.isPublished;
    try {
      await updateDoc(doc(db, 'videos', v.id), {
        isPublished: newStatus,
        updatedAt: serverTimestamp(),
      });
      setVideos((prev) => prev.map((item) => (item.id === v.id ? { ...item, isPublished: newStatus } : item)));
    } catch (err) {
      console.error('Error toggling video status:', err);
    }
  };

  const handleMoveVideo = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= filteredVideos.length) return;

    const currentItem = filteredVideos[index];
    const targetItem = filteredVideos[targetIndex];

    const currentOrder = currentItem.order ?? (index + 1);
    const targetOrder = targetItem.order ?? (targetIndex + 1);

    try {
      await updateDoc(doc(db, 'videos', currentItem.id), { order: targetOrder, updatedAt: serverTimestamp() });
      await updateDoc(doc(db, 'videos', targetItem.id), { order: currentOrder, updatedAt: serverTimestamp() });

      setVideos((prev) => {
        const updated = prev.map((v) => {
          if (v.id === currentItem.id) return { ...v, order: targetOrder };
          if (v.id === targetItem.id) return { ...v, order: currentOrder };
          return v;
        });
        return [...updated].sort((a, b) => (a.order || 0) - (b.order || 0));
      });
    } catch (err) {
      console.error('Error reordering videos:', err);
    }
  };

  // ==========================================
  // BULK IMPORT FOR LESSONS
  // ==========================================
  const handleBulkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkCsvFile(file);
    setBulkError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          setBulkError('The uploaded file is empty or formatted incorrectly.');
          setParsedPreview([]);
          return;
        }
        setParsedPreview(results.data as any[]);
      },
      error: (err) => {
        setBulkError(`CSV Parse Error: ${err.message}`);
      },
    });
  };

  const handleExecuteBulkImport = async () => {
    if (parsedPreview.length === 0) return;
    setBulkImporting(true);
    setBulkError(null);

    try {
      // 1. Upload images if provided and map by file name
      const imageMap: Record<string, string> = {};
      if (bulkImageFiles && bulkImageFiles.length > 0) {
        for (let i = 0; i < bulkImageFiles.length; i++) {
          const img = bulkImageFiles[i];
          const storageRef = ref(storage, `lessons_images/${Date.now()}_${img.name}`);
          await uploadBytes(storageRef, img);
          const url = await getDownloadURL(storageRef);
          imageMap[img.name.toLowerCase()] = url;
        }
      }

      // 2. Iterate and create documents in Firestore
      let addedCount = 0;
      for (const row of parsedPreview) {
        const titleEn = row.title_en || row.title || row.Title || 'Lesson';
        const titleRw = row.title_rw || row.Title_rw || titleEn;
        const titleFr = row.title_fr || row.Title_fr || titleEn;

        const bodyEn = row.body_en || row.body || row.content || '';
        const bodyRw = row.body_rw || bodyEn;
        const bodyFr = row.body_fr || bodyEn;

        const category = row.category || row.Category || categoryOptions[0] || 'Traffic Rules';
        const gazetteRef = row.gazetteReference || row.gazette_ref || row.gazetteRef || null;
        const orderNum = Number(row.order) || (lessons.length + addedCount + 1);
        const isPub = row.isPublished !== undefined ? String(row.isPublished).toLowerCase() === 'true' : true;

        const rowImageNames = (row.images || row.image_names || row.image || '')
          .split(/[,;|]/)
          .map((s: string) => s.trim().toLowerCase())
          .filter(Boolean);

        const matchedUrls: string[] = [];
        rowImageNames.forEach((name: string) => {
          if (imageMap[name]) {
            matchedUrls.push(imageMap[name]);
          }
        });

        const newDoc = {
          title: { en: titleEn, rw: titleRw, fr: titleFr },
          body: { en: bodyEn, rw: bodyRw, fr: bodyFr },
          category,
          gazetteReference: gazetteRef,
          images: matchedUrls,
          order: orderNum,
          isPublished: isPub,
          isFreePreview: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await addDoc(collection(db, 'lessons'), newDoc);
        addedCount++;
      }

      setIsBulkModalOpen(false);
      setParsedPreview([]);
      setBulkCsvFile(null);
      setBulkImageFiles(null);
      fetchData();
    } catch (err: any) {
      console.error('Error during bulk import:', err);
      setBulkError(err.message || 'Failed to import lessons.');
    } finally {
      setBulkImporting(false);
    }
  };

  // ==========================================
  // CATEGORIES MANAGEMENT
  // ==========================================
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      const docRef = await addDoc(collection(db, 'categories'), {
        name: newCatName.trim(),
        order: categories.length + 1,
        createdAt: serverTimestamp(),
      });
      setCategories((prev) => [...prev, { id: docRef.id, name: newCatName.trim(), order: categories.length + 1 }]);
      setNewCatName('');
    } catch (err) {
      console.error('Error creating category:', err);
    }
  };

  const handleUpdateCategory = async (id: string) => {
    if (!editingCatName.trim()) return;
    try {
      await updateDoc(doc(db, 'categories', id), {
        name: editingCatName.trim(),
        updatedAt: serverTimestamp(),
      });
      setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name: editingCatName.trim() } : c)));
      setEditingCatId(null);
      setEditingCatName('');
    } catch (err) {
      console.error('Error updating category:', err);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (categories.length <= 1) {
      alert('At least one category must remain.');
      return;
    }
    if (!confirm('Are you sure you want to remove this category?')) return;
    try {
      await deleteDoc(doc(db, 'categories', id));
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error('Error deleting category:', err);
    }
  };

  // Filtered lists
  const filteredLessons = lessons.filter((l) => {
    const matchCat = categoryFilter === 'all' || l.category === categoryFilter;
    const matchSearch =
      !searchQuery.trim() ||
      (l.title?.en || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.title?.rw || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.category || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.gazetteReference || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  const filteredVideos = videos.filter((v) => {
    const matchCat = categoryFilter === 'all' || v.category === categoryFilter;
    const matchSearch =
      !searchQuery.trim() ||
      (v.title?.en || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.title?.rw || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.category || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Content Management</h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Rwanda National Gazette traffic rules text lessons and YouTube instructional videos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="min-h-[44px] flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-[10px] text-xs sm:text-sm shadow-2xs transition-colors"
          >
            <Tag className="w-4 h-4 text-blue-600" />
            <span>Categories ({categories.length})</span>
          </button>

          {activeTab === 'lessons' ? (
            <>
              <button
                onClick={() => setIsBulkModalOpen(true)}
                className="min-h-[44px] flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-[10px] text-xs sm:text-sm shadow-2xs transition-colors"
              >
                <Upload className="w-4 h-4 text-slate-600" />
                <span>Bulk CSV / Images</span>
              </button>
              <button
                onClick={handleOpenAddLesson}
                className="min-h-[44px] flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-xs sm:text-sm shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Add Lesson</span>
              </button>
            </>
          ) : (
            <button
              onClick={handleOpenAddVideo}
              className="min-h-[44px] flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-xs sm:text-sm shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Video</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs Header with Counts */}
      <div className="flex border-b border-slate-200 gap-8">
        <button
          onClick={() => {
            setActiveTab('lessons');
            setSearchQuery('');
          }}
          className={`flex items-center gap-2 pb-3 font-bold text-sm transition-all border-b-2 relative -mb-px ${
            activeTab === 'lessons'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Lessons ({lessons.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('videos');
            setSearchQuery('');
          }}
          className={`flex items-center gap-2 pb-3 font-bold text-sm transition-all border-b-2 relative -mb-px ${
            activeTab === 'videos'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Video className="w-4 h-4" />
          <span>Videos ({videos.length})</span>
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72 min-h-[44px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            className="w-full pl-9 pr-3 py-2.5 bg-slate-50 rounded-[10px] border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full sm:w-60 min-h-[44px] px-3 py-2 bg-slate-50 rounded-[10px] border border-slate-200 text-xs sm:text-sm font-medium text-slate-900 focus:outline-none"
          >
            <option value="all">All Categories</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* TAB 1: LESSONS */}
      {activeTab === 'lessons' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-slate-50 rounded-lg animate-pulse"></div>
              ))}
            </div>
          ) : filteredLessons.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="font-bold text-slate-900 text-base">No Gazette Lessons Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Get started by creating your first lesson or bulk importing from CSV.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4 w-14"># Order</th>
                    <th className="py-3 px-4">Title & Gazette Ref</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Images</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredLessons.map((l, lIdx) => (
                    <tr key={l.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-500">#{l.order}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-sm">{l.title?.en || l.title?.rw || 'Lesson'}</div>
                        {l.title?.rw && l.title?.rw !== l.title?.en && (
                          <div className="text-[11px] text-slate-500">{l.title.rw}</div>
                        )}
                        {l.gazetteReference && (
                          <div className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded inline-block mt-1">
                            Ref: {l.gazetteReference}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md text-[11px] font-medium">
                          {l.category}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {l.images && l.images.length > 0 ? (
                          <div className="flex items-center gap-1 text-slate-600">
                            <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                            <span className="font-semibold">{l.images.length}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => handleToggleLessonPublished(l)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                            l.isPublished
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {l.isPublished ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          <span>{l.isPublished ? 'Published' : 'Draft'}</span>
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleMoveLesson(lIdx, 'up')}
                            disabled={lIdx === 0}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-20 disabled:hover:bg-transparent"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleMoveLesson(lIdx, 'down')}
                            disabled={lIdx === filteredLessons.length - 1}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-20 disabled:hover:bg-transparent"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEditLesson(l)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit Lesson"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setLessonToDelete(l)}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Lesson"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: VIDEOS */}
      {activeTab === 'videos' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-slate-50 rounded-lg animate-pulse"></div>
              ))}
            </div>
          ) : filteredVideos.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Video className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="font-bold text-slate-900 text-base">No YouTube Videos Found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Add instructional driving videos by pasting YouTube URLs.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4 w-14"># Order</th>
                      <th className="py-3 px-4 w-28">Thumbnail</th>
                      <th className="py-3 px-4">Title & Details</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredVideos.map((v, vIdx) => (
                      <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-500">#{v.order}</td>
                        <td className="py-3.5 px-4">
                          <div className="relative w-24 h-14 bg-slate-900 rounded-lg overflow-hidden group shadow-xs">
                            <img
                              src={v.thumbnail}
                              alt={v.title?.en || 'Video thumbnail'}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Play className="w-5 h-5 text-white fill-white" />
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 text-sm">{v.title?.en || v.title?.rw}</div>
                          {v.title?.rw && v.title.rw !== v.title.en && (
                            <div className="text-[11px] text-slate-500">{v.title.rw}</div>
                          )}
                          <a
                            href={v.youtubeUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline mt-1 font-mono"
                          >
                            <span>ID: {v.youtubeVideoId}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md text-[11px] font-medium">
                            {v.category}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => handleToggleVideoPublished(v)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                              v.isPublished
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            {v.isPublished ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                            <span>{v.isPublished ? 'Published' : 'Draft'}</span>
                          </button>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleMoveVideo(vIdx, 'up')}
                              disabled={vIdx === 0}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-20 disabled:hover:bg-transparent"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleMoveVideo(vIdx, 'down')}
                              disabled={vIdx === filteredVideos.length - 1}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-20 disabled:hover:bg-transparent"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenEditVideo(v)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit Video"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setVideoToDelete(v)}
                              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete Video"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards View */}
              <div className="block md:hidden divide-y divide-slate-100">
                {filteredVideos.map((v, vIdx) => (
                  <div key={v.id} className="p-4 space-y-3">
                    <div className="flex gap-3">
                      <div className="w-24 h-16 bg-slate-900 rounded-lg overflow-hidden shrink-0 relative">
                        <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <Play className="w-4 h-4 text-white fill-white" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 text-sm truncate">{v.title?.en || v.title?.rw}</div>
                        <div className="text-[11px] text-slate-500">{v.category}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">#{v.order}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={() => handleToggleVideoPublished(v)}
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          v.isPublished ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {v.isPublished ? 'Published' : 'Draft'}
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleMoveVideo(vIdx, 'up')}
                          disabled={vIdx === 0}
                          className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleMoveVideo(vIdx, 'down')}
                          disabled={vIdx === filteredVideos.length - 1}
                          className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEditVideo(v)}
                          className="p-1.5 text-slate-600 hover:text-blue-600"
                          title="Edit Video"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setVideoToDelete(v)}
                          className="p-1.5 text-slate-600 hover:text-red-600"
                          title="Delete Video"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD / EDIT LESSON                                 */}
      {/* ========================================================= */}
      {isLessonModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-3xl bg-white rounded-xl shadow-xl border border-slate-200 p-6 sm:p-8 space-y-6 my-8">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-6 h-6 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-lg">
                  {editingLesson ? 'Edit Gazette Lesson' : 'Add Rwanda Gazette Lesson'}
                </h3>
              </div>
              <button
                onClick={() => setIsLessonModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLesson} className="space-y-5">
              {/* Titles in 3 Languages */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Title (English) *</label>
                  <input
                    type="text"
                    required
                    value={lessonTitleEn}
                    onChange={(e) => setLessonTitleEn(e.target.value)}
                    placeholder="Speed limits in residential areas"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-[8px] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Title (Kinyarwanda)</label>
                  <input
                    type="text"
                    value={lessonTitleRw}
                    onChange={(e) => setLessonTitleRw(e.target.value)}
                    placeholder="Umuvuduko mu nsisiro"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-[8px] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Title (French)</label>
                  <input
                    type="text"
                    value={lessonTitleFr}
                    onChange={(e) => setLessonTitleFr(e.target.value)}
                    placeholder="Limites de vitesse en agglomération"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-[8px] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Category & Gazette Reference & Order */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Category *</label>
                  <select
                    value={lessonCategory}
                    onChange={(e) => setLessonCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-[8px] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Gazette Reference (Optional)
                  </label>
                  <input
                    type="text"
                    value={lessonGazetteRef}
                    onChange={(e) => setLessonGazetteRef(e.target.value)}
                    placeholder="e.g. Gazette n° Special, Art. 14"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-[8px] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Display Order</label>
                  <input
                    type="number"
                    min="1"
                    value={lessonOrder}
                    onChange={(e) => setLessonOrder(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-[8px] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Lesson Body (Rich Text in 3 Languages) */}
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase">
                      Body Content - English (Markdown / Headings / Lists / Tables) *
                    </label>
                  </div>
                  <textarea
                    rows={5}
                    required
                    value={lessonBodyEn}
                    onChange={(e) => setLessonBodyEn(e.target.value)}
                    placeholder="### Article Summary&#10;- Point 1&#10;- Point 2&#10;&#10;**Bold notes** and official speed regulations."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-[8px] text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                  ></textarea>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Body Content - Kinyarwanda
                    </label>
                    <textarea
                      rows={4}
                      value={lessonBodyRw}
                      onChange={(e) => setLessonBodyRw(e.target.value)}
                      placeholder="Amategeko y'umuhanda mu Kinyarwanda..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-[8px] text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                    ></textarea>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Body Content - French
                    </label>
                    <textarea
                      rows={4}
                      value={lessonBodyFr}
                      onChange={(e) => setLessonBodyFr(e.target.value)}
                      placeholder="Règles de circulation en français..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-[8px] text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                    ></textarea>
                  </div>
                </div>
              </div>

              {/* Images uploaded to Firebase Storage */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 uppercase">
                  Lesson Diagrams & Gazette Images
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="min-h-[40px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-[8px] text-xs cursor-pointer inline-flex items-center gap-2 transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingImage ? 'Uploading to Storage...' : 'Upload Image(s)'}</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleUploadLessonImage}
                      disabled={uploadingImage}
                      className="hidden"
                    />
                  </label>
                  <span className="text-xs text-slate-400">Upload road signs, diagrams, or Gazette clippings.</span>
                </div>

                {lessonImages.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-2">
                    {lessonImages.map((imgUrl, i) => (
                      <div key={i} className="relative group rounded-lg overflow-hidden border border-slate-200 aspect-square bg-slate-50">
                        <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveLessonImage(i)}
                          className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Switches: Published & Free Preview */}
              <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lessonPublished}
                    onChange={(e) => setLessonPublished(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-xs font-semibold text-slate-800">Publish immediately</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lessonFreePreview}
                    onChange={(e) => setLessonFreePreview(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-xs font-semibold text-slate-800">Free preview (accessible without subscription)</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsLessonModalOpen(false)}
                  className="min-h-[44px] px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-[10px] text-xs sm:text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadingImage}
                  className="min-h-[44px] px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-xs sm:text-sm shadow-sm transition-colors"
                >
                  {editingLesson ? 'Save Changes' : 'Create Lesson'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD / EDIT VIDEO (YOUTUBE)                         */}
      {/* ========================================================= */}
      {isVideoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl border border-slate-200 p-6 sm:p-8 space-y-6 my-8">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <Video className="w-6 h-6 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-lg">
                  {editingVideo ? 'Edit Instructional Video' : 'Add YouTube Instructional Video'}
                </h3>
              </div>
              <button
                onClick={() => setIsVideoModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveVideo} className="space-y-5">
              {/* YouTube URL with Live Preview */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  YouTube Video Link or ID *
                </label>
                <input
                  type="text"
                  required
                  value={videoYoutubeUrl}
                  onChange={(e) => setVideoYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-[8px] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Supports youtube.com/watch?v=..., youtu.be/..., or embed URLs.
                </p>

                {/* Live YouTube Preview Player */}
                {youtubeIdFromUrl ? (
                  <div className="mt-3 rounded-xl overflow-hidden border border-slate-200 aspect-video bg-black shadow-sm">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${youtubeIdFromUrl}`}
                      title="Live YouTube Preview"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    ></iframe>
                  </div>
                ) : videoYoutubeUrl.length > 5 ? (
                  <div className="mt-2 p-3 bg-amber-50 text-amber-800 text-xs rounded-lg border border-amber-200">
                    Could not detect a valid YouTube video ID from this link yet.
                  </div>
                ) : null}
              </div>

              {/* Titles in 3 Languages */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Title (English) *</label>
                  <input
                    type="text"
                    required
                    value={videoTitleEn}
                    onChange={(e) => setVideoTitleEn(e.target.value)}
                    placeholder="How to navigate roundabouts"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-[8px] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Title (Kinyarwanda)</label>
                  <input
                    type="text"
                    value={videoTitleRw}
                    onChange={(e) => setVideoTitleRw(e.target.value)}
                    placeholder="Uburyo bwo kuzenguruka mu masangano"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-[8px] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Title (French)</label>
                  <input
                    type="text"
                    value={videoTitleFr}
                    onChange={(e) => setVideoTitleFr(e.target.value)}
                    placeholder="Comment aborder un rond-point"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-[8px] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Category & Order */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Category *</label>
                  <select
                    value={videoCategory}
                    onChange={(e) => setVideoCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-[8px] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Display Order</label>
                  <input
                    type="number"
                    min="1"
                    value={videoOrder}
                    onChange={(e) => setVideoOrder(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-[8px] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Descriptions */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Description / Video Summary (English)
                </label>
                <textarea
                  rows={3}
                  value={videoDescEn}
                  onChange={(e) => setVideoDescEn(e.target.value)}
                  placeholder="Key concepts explained in this video..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-[8px] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                ></textarea>
              </div>

              {/* Switches: Published & Free Preview */}
              <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={videoPublished}
                    onChange={(e) => setVideoPublished(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-xs font-semibold text-slate-800">Publish immediately</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={videoFreePreview}
                    onChange={(e) => setVideoFreePreview(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-xs font-semibold text-slate-800">Free preview video (unlocked for all)</span>
                </label>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsVideoModalOpen(false)}
                  className="min-h-[44px] px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-[10px] text-xs sm:text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!youtubeIdFromUrl}
                  className="min-h-[44px] px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-xs sm:text-sm shadow-sm transition-colors disabled:opacity-50"
                >
                  {editingVideo ? 'Save Changes' : 'Add Video'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: BULK CSV & IMAGES IMPORT                          */}
      {/* ========================================================= */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-3xl bg-white rounded-xl shadow-xl border border-slate-200 p-6 sm:p-8 space-y-6 my-8">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-6 h-6 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-lg">Bulk Import Lessons from CSV / Excel</h3>
              </div>
              <button
                onClick={() => setIsBulkModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 leading-relaxed">
                <p className="font-bold mb-1">Expected CSV Column Headers:</p>
                <code>title_en, title_rw, title_fr, body_en, body_rw, body_fr, category, gazetteReference, order, images</code>
                <p className="mt-1 text-[11px] text-blue-700">
                  You can also upload diagram images at the same time. The file names in the <code>images</code> column will be automatically matched to the uploaded images.
                </p>
              </div>

              {bulkError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{bulkError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    1. Select CSV File *
                  </label>
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleBulkFileChange}
                    className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-[8px] file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    2. Upload Accompanying Images
                  </label>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => setBulkImageFiles(e.target.files)}
                    className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-[8px] file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    {bulkImageFiles ? `${bulkImageFiles.length} image file(s) selected` : 'Optional'}
                  </span>
                </div>
              </div>

              {/* Validation Preview Table */}
              {parsedPreview.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                    <span>Validation Preview ({parsedPreview.length} lessons detected)</span>
                    <span className="text-emerald-600">✓ Ready for import</span>
                  </div>

                  <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                        <tr>
                          <th className="py-2 px-3">Title (EN)</th>
                          <th className="py-2 px-3">Category</th>
                          <th className="py-2 px-3">Gazette Ref</th>
                          <th className="py-2 px-3">Images</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedPreview.slice(0, 8).map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-semibold text-slate-900 truncate max-w-[200px]">
                              {row.title_en || row.title || row.Title || 'Lesson'}
                            </td>
                            <td className="py-2 px-3 text-slate-600">{row.category || row.Category || 'General'}</td>
                            <td className="py-2 px-3 text-slate-500 font-mono text-[10px]">
                              {row.gazetteReference || row.gazette_ref || '—'}
                            </td>
                            <td className="py-2 px-3 text-slate-500 text-[10px]">{row.images || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parsedPreview.length > 8 && (
                    <p className="text-[11px] text-slate-400 text-center">
                      ...and {parsedPreview.length - 8} more lessons.
                    </p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="min-h-[44px] px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-[10px] text-xs sm:text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteBulkImport}
                  disabled={parsedPreview.length === 0 || bulkImporting}
                  className="min-h-[44px] px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-xs sm:text-sm shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{bulkImporting ? 'Importing to Firestore...' : `Save ${parsedPreview.length} Lessons`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CATEGORIES MANAGEMENT                             */}
      {/* ========================================================= */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-slate-200 p-6 space-y-5">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <Tag className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-lg">Manage Content Categories</h3>
              </div>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCategory} className="flex gap-2">
              <input
                type="text"
                required
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="New Category Name..."
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-[8px] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                className="min-h-[40px] px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[8px] text-xs shadow-sm transition-colors"
              >
                Add
              </button>
            </form>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {categories.map((cat) => {
                const isEditing = editingCatId === cat.id;
                const nameStr = typeof cat.name === 'string' ? cat.name : (cat.name as any)?.en || 'Category';

                return (
                  <div key={cat.id} className="p-3 flex items-center justify-between gap-2 text-xs">
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editingCatName}
                          onChange={(e) => setEditingCatName(e.target.value)}
                          className="flex-1 px-2 py-1 border border-blue-500 rounded text-xs"
                          autoFocus
                        />
                        <button
                          onClick={() => handleUpdateCategory(cat.id)}
                          className="px-2.5 py-1 bg-emerald-600 text-white rounded font-semibold text-[11px]"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingCatId(null)}
                          className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-[11px]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="font-semibold text-slate-800">{nameStr}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingCatId(cat.id);
                              setEditingCatName(nameStr);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="p-1 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="min-h-[40px] px-5 py-2 bg-slate-900 text-white font-semibold rounded-[8px] text-xs hover:bg-slate-800"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Lesson Confirmation */}
      <ConfirmModal
        isOpen={Boolean(lessonToDelete)}
        title="Delete Lesson"
        message={`Are you sure you want to permanently delete "${lessonToDelete?.title?.en || lessonToDelete?.title?.rw || 'this lesson'}"?`}
        confirmText="Delete Lesson"
        isDestructive={true}
        onConfirm={handleDeleteLesson}
        onClose={() => setLessonToDelete(null)}
      />

      {/* Delete Video Confirmation */}
      <ConfirmModal
        isOpen={Boolean(videoToDelete)}
        title="Delete Video"
        message={`Are you sure you want to permanently delete "${videoToDelete?.title?.en || videoToDelete?.title?.rw || 'this video'}"?`}
        confirmText="Delete Video"
        isDestructive={true}
        onConfirm={handleDeleteVideo}
        onClose={() => setVideoToDelete(null)}
      />
    </div>
  );
};
