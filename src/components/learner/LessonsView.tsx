import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, doc, setDoc, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { Lesson, VideoLesson, Language, CombinedAccess, Subscription } from '../../types';
import { normalizeSubscription, getCombinedAccess } from '../../lib/subscriptionUtils';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  BookOpen,
  Lock,
  ChevronRight,
  ArrowLeft,
  Video,
  Play,
  Search,
  Tag,
  ExternalLink,
  ImageIcon,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronLeft,
  Clock,
  Award
} from 'lucide-react';
import { SubscriptionModal } from './SubscriptionModal';
import { RichTextRenderer } from '../common/RichTextRenderer';
import { getLocalizedQuestionOptions, getLocalizedQuestionExplanation } from '../../lib/i18n';
import { t } from '../../i18n/translations';

  // Segments are loaded from lesson_segments collection
export const LessonsView: React.FC<{ onBack: () => void; initialTab?: 'lessons' | 'videos' }> = ({
  onBack,
  initialTab = 'lessons',
}) => {
  const { userProfile, firebaseUser, getIdToken } = useAuth();
  const getToken = async () => {
    if (typeof getIdToken === 'function') return await getIdToken();
    return firebaseUser && typeof firebaseUser.getIdToken === 'function' ? await firebaseUser.getIdToken() : '';
  };

  const { language } = useLanguage();
  const [activeSection, setActiveSection] = useState<'lessons' | 'videos'>(initialTab);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [videos, setVideos] = useState<VideoLesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoLesson | null>(null);
  const [access, setAccess] = useState<CombinedAccess | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Lesson Quiz State
  const [quizState, setQuizState] = useState<'idle' | 'loading' | 'active' | 'submitted'>('idle');
  const [quizQuestions, setQuizQuestions] = useState<any[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizResult, setQuizResult] = useState<any | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [noQuizYet, setNoQuizYet] = useState(false);


  // Real-time subscriptions, purchases, access & progress listeners
  useEffect(() => {
    if (!userProfile) return;

    let latestSubs: any[] = [];
    let latestPurchases: any[] = [];
    let latestAccessDocs: any[] = [];

    const updateCombined = () => {
      const allList: Subscription[] = [];
      latestPurchases.forEach(d => allList.push(normalizeSubscription(d.data(), d.id)));
      latestSubs.forEach(d => {
        if (!allList.some(p => p.id === d.id || p.planId === d.data().planId)) {
          allList.push(normalizeSubscription(d.data(), d.id));
        }
      });
      latestAccessDocs.forEach(d => {
        const data = d.data();
        if (data) {
          allList.push(normalizeSubscription(data, d.id));
        }
      });

      const combined = getCombinedAccess(allList);
      setAccess(combined);
    };

    const unsubSubs = onSnapshot(query(collection(db, 'subscriptions'), where('userId', '==', userProfile.uid)), (snap) => {
      latestSubs = snap.docs;
      updateCombined();
    }, () => {});

    const unsubPurchases = onSnapshot(query(collection(db, 'users', userProfile.uid, 'purchases')), (snap) => {
      latestPurchases = snap.docs;
      updateCombined();
    }, () => {});

    const unsubAccess = onSnapshot(collection(db, 'users', userProfile.uid, 'access'), (snap) => {
      latestAccessDocs = snap.docs;
      updateCombined();
    }, () => {});

    const unsubProgress = onSnapshot(collection(db, 'users', userProfile.uid, 'progress'), (snap) => {
      const pMap: Record<string, any> = {};
      snap.docs.forEach(d => {
        pMap[d.id] = d.data();
      });
      setProgressMap(pMap);
    }, () => {});

    return () => {
      unsubSubs();
      unsubPurchases();
      unsubAccess();
      unsubProgress();
    };
  }, [userProfile]);

  // Fetch published lessons and videos on mount
  useEffect(() => {
    async function fetchContent() {
      try {
        const lSnap = await getDocs(query(collection(db, 'lessons'), orderBy('order', 'asc'))).catch((err) => {
          handleFirestoreError(err, OperationType.LIST, 'lessons');
          return null;
        });
        if (lSnap) {
          const list = lSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Lesson))
            .filter((l) => l.isPublished !== false);
          setLessons(list);
        }

        const vSnap = await getDocs(query(collection(db, 'videos'), orderBy('order', 'asc'))).catch((err) => {
          handleFirestoreError(err, OperationType.LIST, 'videos');
          return null;
        });
        if (vSnap) {
          const vList = vSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as VideoLesson))
            .filter((v) => v.isPublished !== false);
          setVideos(vList);
        }
      } catch (err) {
        console.error('Error loading lessons and videos:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchContent();
  }, []);

  const checkSubAndFetch = () => {
    // Refresh handler kept for modal triggers
  };

  // Categories list
  const allCategories = Array.from(
    new Set([
      ...lessons.map((l) => l.category),
      ...videos.map((v) => v.category),
    ])
  ).filter(Boolean);

  // Access checks based on plan rules
  const hasTrafficRulesAccess = Boolean(access?.trafficRules) || Boolean(access?.hasActiveSubscription) || userProfile?.role === 'admin' || access === null;
  const hasLessonVideosAccess = Boolean(access?.lessonVideos) || Boolean(access?.hasActiveSubscription) || userProfile?.role === 'admin' || access === null;

  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [lessonSegments, setLessonSegments] = useState<any[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [showContentsDrawer, setShowContentsDrawer] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedLesson) {
      setLessonSegments([]);
      return;
    }

    // Get content with language fallback
    const rawContent = selectedLesson.body?.[language as Language] || selectedLesson.body?.en || selectedLesson.body?.rw || '';
    
    // Split on '---'
    const parts = rawContent.split(/\n---\n/);
    
    const segments = parts.map((content, index) => {
      const trimmedContent = content.trim();
      const words = trimmedContent.split(/\s+/).slice(0, 5);
      const title = `${words.join(' ')}${words.length >= 5 ? '…' : ''}`;
      
      return {
        id: `${selectedLesson.id}-${index + 1}`,
        segment_order: index + 1,
        title,
        content: trimmedContent
      };
    });

    setLessonSegments(segments.length > 0 ? segments : [{ id: `${selectedLesson.id}-1`, segment_order: 1, title: '', content: rawContent }]);
    setCurrentSegmentIndex(0);
    setIsFinished(false);
  }, [selectedLesson, language]);

  // Mark lesson as completed when finished
  useEffect(() => {
    if (isFinished && selectedLesson && userProfile) {
      const progressRef = doc(db, 'users', userProfile.uid, 'progress', selectedLesson.id);
      setDoc(progressRef, {
        lessonId: selectedLesson.id,
        completed: true,
        lastAccessed: new Date().toISOString()
      }, { merge: true }).catch(() => {});
    }
  }, [isFinished, selectedLesson, userProfile]);

  const getSegmentTitle = (seg: any) => {
    if (!seg) return '';
    return seg.title || '';
  };

  const getSegmentContent = (seg: any) => {
    if (!seg) return '';
    return seg.content || '';
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedLesson || (!hasTrafficRulesAccess && !selectedLesson.isFreePreview)) return;
      if (isFinished) return;
      if (e.key === 'ArrowRight') {
        if (currentSegmentIndex < lessonSegments.length - 1) {
          setCurrentSegmentIndex(prev => prev + 1);
        } else {
          setIsFinished(true);
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentSegmentIndex > 0) {
          setCurrentSegmentIndex(prev => prev - 1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLesson, currentSegmentIndex, lessonSegments.length, isFinished, hasTrafficRulesAccess]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        if (currentSegmentIndex < lessonSegments.length - 1) {
          setCurrentSegmentIndex(prev => prev + 1);
        } else {
          setIsFinished(true);
        }
      } else {
        if (currentSegmentIndex > 0) {
          setCurrentSegmentIndex(prev => prev - 1);
        }
      }
    }
    setTouchStartX(null);
  };

  const handleNextLesson = () => {
    if (!selectedLesson) return;
    const idx = lessons.findIndex(l => l.id === selectedLesson.id);
    if (idx !== -1 && idx < lessons.length - 1) {
      handleSelectLesson(lessons[idx + 1]);
    } else {
      setSelectedLesson(null);
    }
  };

  const tr = (key: string) => {
    return (t as any)[language]?.[key] || (t as any).en?.[key] || key;
  };

  // Filtering
  const filteredLessons = lessons.filter((l) => {
    const matchCat = categoryFilter === 'all' || l.category === categoryFilter;
    const matchSearch =
      !searchQuery.trim() ||
      (l.title?.[language as Language] || l.title?.en || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.category || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  const filteredVideos = videos.filter((v) => {
    const matchCat = categoryFilter === 'all' || v.category === categoryFilter;
    const matchSearch =
      !searchQuery.trim() ||
      (v.title?.[language as Language] || v.title?.en || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (v.category || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  // Pagination & metrics
  const totalLessons = filteredLessons.length;
  const totalLessonPages = Math.max(1, Math.ceil(totalLessons / pageSize));
  const safeLessonPage = Math.min(Math.max(1, currentPage), totalLessonPages);
  const startLessonIndex = totalLessons === 0 ? 0 : (safeLessonPage - 1) * pageSize;
  const endLessonIndex = Math.min(startLessonIndex + pageSize, totalLessons);
  const paginatedLessons = filteredLessons.slice(startLessonIndex, endLessonIndex);

  const passedLessonsCount = lessons.filter(l => progressMap[l.id]?.passed).length;
  const progressPercent = lessons.length > 0 ? Math.round((passedLessonsCount / lessons.length) * 100) : 0;

  // Category counts map for interactive chips
  const categoryCounts = lessons.reduce((acc, l) => {
    if (l.category) {
      acc[l.category] = (acc[l.category] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const handleCategoryChange = (cat: string) => {
    setCategoryFilter(cat);
    setCurrentPage(1);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  const handleSectionChange = (section: 'lessons' | 'videos') => {
    setActiveSection(section);
    setSearchQuery('');
    setCategoryFilter('all');
    setCurrentPage(1);
  };

  const goToPage = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 120, behavior: 'smooth' });
  };

  const handleSelectLesson = (lesson: Lesson) => {
    setSelectedLesson(lesson);
    setSelectedVideo(null);
    setQuizState('idle');
    setQuizQuestions([]);
    setQuizAnswers({});
    setQuizResult(null);
    setQuizError(null);
    setNoQuizYet(false);
  };

  const handleSelectVideo = (video: VideoLesson) => {
    setSelectedVideo(video);
    setSelectedLesson(null);
  };

  const handleStartLessonQuiz = async () => {
    if (!selectedLesson) return;
    setQuizLoading(true);
    setQuizError(null);
    setNoQuizYet(false);
    try {
      const token = await getToken();
      const res = await fetch(`/api/lessons/${selectedLesson.id}/quiz`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 403) {
          setIsSubModalOpen(true);
          return;
        }
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to fetch lesson quiz');
      }
      const data = await res.json();
      if (!data.questions || data.questions.length === 0) {
        setNoQuizYet(true);
        setQuizState('idle');
      } else {
        setQuizQuestions(data.questions);
        setQuizAnswers({});
        setQuizResult(null);
        setQuizState('active');
      }
    } catch (err: any) {
      console.error('Error fetching quiz:', err);
      setQuizError(err.message || 'Failed to start quiz');
    } finally {
      setQuizLoading(false);
    }
  };

  const handleQuizAnswer = (questionId: string, optionIndex: number) => {
    setQuizAnswers(prev => ({ ...prev, [questionId]: optionIndex }));
  };

  const handleQuizSubmit = async () => {
    if (!selectedLesson) return;
    setQuizLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/lessons/${selectedLesson.id}/quiz/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ answers: quizAnswers })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to submit quiz');
      }
      const resultData = await res.json();
      setQuizResult(resultData);
      setQuizState('submitted');
      checkSubAndFetch();
    } catch (err: any) {
      console.error('Error submitting quiz:', err);
      setQuizError(err.message || 'Failed to submit quiz');
    } finally {
      setQuizLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar Navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <button
          onClick={() => {
            if (selectedLesson || selectedVideo) {
              setSelectedLesson(null);
              setSelectedVideo(null);
            } else {
              onBack();
            }
          }}
          className="min-h-[44px] flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{selectedLesson || selectedVideo ? tr('backToContentList') : tr('backToDashboard')}</span>
        </button>

        {(!hasTrafficRulesAccess || !hasLessonVideosAccess) && (
          <button
            onClick={() => setIsSubModalOpen(true)}
            className="min-h-[44px] flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-xs sm:text-sm shadow-sm transition-colors"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Unlock All Study Content</span>
          </button>
        )}
      </div>

      {/* DETAILED LESSON VIEW */}
      {selectedLesson ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                  {selectedLesson.category}
                </span>
                {selectedLesson.gazetteReference && (
                  <span className="text-xs font-mono font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full break-words max-w-full">
                    Ref: {selectedLesson.gazetteReference}
                  </span>
                )}
                {progressMap[selectedLesson.id]?.passed && (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Quiz Passed</span>
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 pt-1">
                {selectedLesson.title?.[language as Language] || selectedLesson.title?.en}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowContentsDrawer(true)}
                className="md:hidden min-h-[40px] px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors"
              >
                <BookOpen className="w-4 h-4" />
                <span>Segments ({lessonSegments.length})</span>
              </button>
              <button
                onClick={() => setSelectedLesson(null)}
                className="min-h-[40px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-[8px] text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>

          {/* Locked Check for Lesson */}
          {!hasTrafficRulesAccess && !selectedLesson.isFreePreview ? (
            <div className="p-8 sm:p-12 text-center bg-white rounded-xl border border-slate-200 shadow-sm space-y-4">
              <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                <Lock className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900">{tr('trafficRulesLessonLocked')}</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  {tr('requiresActiveStudyPass')}
                </p>
              </div>
              <button
                onClick={() => setIsSubModalOpen(true)}
                className="min-h-[44px] inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-sm shadow-sm transition-colors"
              >
                <Lock className="w-4 h-4" />
                <span>{tr('upgradeToReadFullLesson')}</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
              {/* Desktop Left Side Panel */}
              <div className="hidden md:block md:col-span-1 bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3 sticky top-6">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <span>{tr('contents')} ({lessonSegments.length})</span>
                </h3>
                <div className="space-y-1 max-h-[60vh] overflow-y-auto no-scrollbar">
                  {lessonSegments.map((seg, sIdx) => {
                    const isCurrent = !isFinished && currentSegmentIndex === sIdx;
                    return (
                      <button
                        key={seg.id || sIdx}
                        onClick={() => {
                          setIsFinished(false);
                          setCurrentSegmentIndex(sIdx);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-between ${
                          isCurrent
                            ? 'bg-blue-600 text-white font-bold'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="truncate pr-2">{getSegmentTitle(seg)}</span>
                        {isCurrent && <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Center Reader Card */}
              <div className="md:col-span-3 space-y-6">
                <div
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-10 space-y-6 min-h-[380px] flex flex-col justify-between max-w-[720px] mx-auto w-full"
                >
                  {isFinished ? (
                    <div className="py-12 text-center space-y-6">
                      <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                        <CheckCircle2 className="w-10 h-10" />
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-2xl font-black text-slate-900">{tr('lessonCompleted')}</h2>
                        <p className="text-sm text-slate-600 max-w-sm mx-auto">
                          {language === 'rw' ? "Warangije gusoma iyi nyigisho neza. Ushobora gukomeza ku isomo rikurikira cyangwa ugakora ikizamini." : language === 'fr' ? "Vous avez terminé cette leçon avec succès. Passez à la suivante ou testez vos connaissances." : "You have successfully finished this lesson. Continue to the next lesson or test your knowledge."}
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
                        <button
                          onClick={handleNextLesson}
                          className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm shadow-sm transition-colors flex items-center justify-center gap-2"
                        >
                          <span>{tr('nextLesson')}</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setSelectedLesson(null)}
                          className="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition-colors"
                        >
                          {tr('backToList')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="space-y-2 pb-4 border-b border-slate-100">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                          <span>{currentSegmentIndex + 1} of {lessonSegments.length}</span>
                          <span>{Math.round(((currentSegmentIndex + 1) / lessonSegments.length) * 100)}% completed</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                            style={{ width: `${((currentSegmentIndex + 1) / lessonSegments.length) * 100}%` }}
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h2 className="text-lg font-bold text-slate-900">
                          {getSegmentTitle(lessonSegments[currentSegmentIndex])}
                        </h2>
                        <div className="text-[18px] leading-[1.7] text-slate-800 space-y-4 whitespace-pre-line">
                          {getSegmentContent(lessonSegments[currentSegmentIndex])}
                        </div>
                      </div>

                      {lessonSegments[currentSegmentIndex]?.image_names && typeof lessonSegments[currentSegmentIndex].image_names === 'string' && lessonSegments[currentSegmentIndex].image_names.trim() && (
                        <div className="pt-6 border-t border-slate-100 space-y-3">
                          <h4 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                            <ImageIcon className="w-4 h-4 text-blue-600" />
                            <span>Segment Diagrams & Signs</span>
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {lessonSegments[currentSegmentIndex].image_names.split('|').filter(Boolean).map((imgUrl: string, i: number) => (
                              <div key={i} className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                                <img src={imgUrl.trim()} alt="" className="w-full h-40 object-contain bg-white p-2" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {currentSegmentIndex === lessonSegments.length - 1 && selectedLesson.images && selectedLesson.images.length > 0 && (
                        <div className="pt-6 border-t border-slate-100 space-y-3">
                          <h4 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                            <ImageIcon className="w-4 h-4 text-blue-600" />
                            <span>Official Gazette Diagrams & Signs</span>
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {selectedLesson.images.map((imgUrl, i) => (
                              <div key={i} className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                                <img src={imgUrl} alt="" className="w-full h-40 object-contain bg-white p-2" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bottom Navigation Controls */}
                  {!isFinished && (
                    <div className="pt-6 border-t border-slate-100 flex items-center justify-between gap-4">
                      <button
                        onClick={() => {
                          if (currentSegmentIndex > 0) {
                            setCurrentSegmentIndex(prev => prev - 1);
                          }
                        }}
                        disabled={currentSegmentIndex === 0}
                        className="min-h-[44px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs sm:text-sm disabled:opacity-40 transition-colors flex items-center gap-1.5"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>{tr('previous')}</span>
                      </button>

                      <div className="text-xs font-mono font-bold text-slate-500">
                        {currentSegmentIndex + 1} / {lessonSegments.length}
                      </div>

                      <button
                        onClick={() => {
                          if (currentSegmentIndex < lessonSegments.length - 1) {
                            setCurrentSegmentIndex(prev => prev + 1);
                          } else {
                            setIsFinished(true);
                          }
                        }}
                        className="min-h-[44px] px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-sm transition-colors flex items-center gap-1.5"
                      >
                        <span>{currentSegmentIndex === lessonSegments.length - 1 ? tr('finishLesson') : tr('next')}</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* LESSON QUIZ SECTION */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 max-w-[720px] mx-auto w-full">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-blue-600" />
                      <span>{language === 'rw' ? "Ikizamini cy'iyi Nyigisho" : language === 'fr' ? "Quiz de la Leçon" : "Lesson Quiz"}</span>
                    </h3>
                    {progressMap[selectedLesson.id]?.passed && (
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Quiz Passed</span>
                      </span>
                    )}
                  </div>

                  {noQuizYet ? (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-600 text-center">
                      {language === 'rw' ? "Nta kizamini cy'iyi nyigisho kirajyaho." : language === 'fr' ? "Pas encore de quiz pour cette leçon." : "No quiz for this lesson yet."}
                    </div>
                  ) : quizState === 'idle' ? (
                    <div className="p-5 bg-blue-50/60 rounded-xl border border-blue-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="space-y-1 text-center sm:text-left">
                        <h4 className="font-bold text-slate-900 text-sm">
                          {language === 'rw' ? "Witeguye kwitoza kuri iyi nyigisho?" : language === 'fr' ? "Prêt à faire le quiz de cette leçon ?" : "Take the quiz for this lesson"}
                        </h4>
                        <p className="text-xs text-slate-600">
                          {language === 'rw' ? "Gerageza ubumenyi bwawe n'ibibazo byihariye." : language === 'fr' ? "Testez vos connaissances." : "Test your understanding with questions specific to this lesson."}
                        </p>
                      </div>
                      <button
                        onClick={handleStartLessonQuiz}
                        disabled={quizLoading}
                        className="min-h-[40px] px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs shadow-sm transition-colors shrink-0 disabled:opacity-50"
                      >
                        {quizLoading ? 'Loading...' : 'Take Quiz'}
                      </button>
                    </div>
                  ) : quizState === 'active' ? (
                    <div className="space-y-6 bg-slate-50 p-5 rounded-xl border border-slate-200">
                      <div className="flex justify-between items-center text-xs font-semibold text-slate-600 border-b border-slate-200 pb-3">
                        <span>{quizQuestions.length} Questions</span>
                        <span className="text-blue-600">Pass mark: 70%</span>
                      </div>

                      <div className="space-y-6">
                        {quizQuestions.map((q, idx) => (
                          <div key={q.id} className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-2xs">
                            <div className="font-bold text-slate-900 text-xs sm:text-sm flex gap-2">
                              <span className="text-blue-600">#{idx + 1}</span>
                              <span>{q.text}</span>
                            </div>
                            {Array.isArray(q.images) && q.images.length > 0 && (
                              <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-4 py-3">
                                {q.images.map((imgUrl: string, i: number) => (
                                  <div key={i} className="w-full sm:w-auto max-w-md bg-slate-50/90 border border-slate-200/90 rounded-2xl p-4 flex justify-center shadow-xs">
                                    <img src={imgUrl} alt="" className="max-h-64 sm:max-h-80 w-auto object-contain rounded-xl" />
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="grid grid-cols-1 gap-2 pt-2">
                              {(q.options || []).map((opt: string, optIdx: number) => {
                                const isSelected = quizAnswers[q.id] === optIdx;
                                return (
                                  <button
                                    key={optIdx}
                                    type="button"
                                    onClick={() => handleQuizAnswer(q.id, optIdx)}
                                    className={`w-full text-left p-2.5 rounded-lg border text-xs font-medium transition-all flex items-start gap-2.5 ${
                                      isSelected
                                        ? 'bg-blue-50 border-blue-600 text-blue-900'
                                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                                    }`}
                                  >
                                    <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 text-[11px] font-bold ${
                                      isSelected ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-500'
                                    }`}>
                                      {String.fromCharCode(65 + optIdx)}
                                    </span>
                                    <span>{opt}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                        <button
                          onClick={() => setQuizState('idle')}
                          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleQuizSubmit}
                          disabled={quizLoading || Object.keys(quizAnswers).length === 0}
                          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs shadow-sm disabled:opacity-50"
                        >
                          {quizLoading ? 'Submitting...' : 'Submit Quiz'}
                        </button>
                      </div>
                    </div>
                  ) : quizState === 'submitted' && quizResult ? (
                    <div className="space-y-6 bg-white p-5 rounded-xl border border-slate-200">
                      <div className={`p-5 rounded-xl text-center space-y-2 ${
                        quizResult.passed ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-amber-50 border border-amber-200 text-amber-900'
                      }`}>
                        <div className="text-xl font-bold">
                          {quizResult.passed ? "Quiz Passed Successfully!" : "Keep practicing!"}
                        </div>
                        <p className="text-xs font-medium">
                          Score: <span className="font-bold">{quizResult.score}</span> / {quizResult.total} ({quizResult.percent}%) — Pass mark: 70%
                        </p>
                      </div>

                      <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                        <button
                          onClick={() => setQuizState('idle')}
                          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                        >
                          Back to Lesson
                        </button>
                        <button
                          onClick={handleStartLessonQuiz}
                          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs shadow-sm flex items-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Retry Quiz</span>
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {quizError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
                      {quizError}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Mobile Contents Drawer Modal */}
          {showContentsDrawer && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
              <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col shadow-xl">
                <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-blue-600" />
                    <span>{tr('contents')} ({lessonSegments.length})</span>
                  </h3>
                  <button
                    onClick={() => setShowContentsDrawer(false)}
                    className="p-1 rounded-lg text-slate-500 hover:bg-slate-100"
                  >
                    ✕
                  </button>
                </div>
                <div className="p-4 overflow-y-auto space-y-1">
                  {lessonSegments.map((seg, sIdx) => {
                    const isCurrent = !isFinished && currentSegmentIndex === sIdx;
                    return (
                      <button
                        key={seg.id || sIdx}
                        onClick={() => {
                          setIsFinished(false);
                          setCurrentSegmentIndex(sIdx);
                          setShowContentsDrawer(false);
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-between ${
                          isCurrent
                            ? 'bg-blue-600 text-white font-bold'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="truncate pr-2">{getSegmentTitle(seg)}</span>
                        {isCurrent && <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : selectedVideo ? (
        /* DETAILED VIDEO VIEW */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-3 py-1 rounded-full">
                  {selectedVideo.category}
                </span>
                {selectedVideo.isFreePreview && (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span>Free Preview</span>
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 pt-1">
                {selectedVideo.title?.[language as Language] || selectedVideo.title?.en}
              </h1>
            </div>

            <button
              onClick={() => setSelectedVideo(null)}
              className="min-h-[40px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-[8px] text-xs transition-colors"
            >
              Close
            </button>
          </div>

          {/* Locked Check for Video */}
          {!hasLessonVideosAccess && !selectedVideo.isFreePreview ? (
            <div className="p-8 sm:p-12 text-center bg-slate-50 rounded-xl border border-slate-200 space-y-4">
              <div className="w-16 h-16 bg-purple-100 text-purple-700 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                <Lock className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900">Instructional Video Locked</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Video lessons require an active study pass with video tutorial access.
                </p>
              </div>
              <button
                onClick={() => setIsSubModalOpen(true)}
                className="min-h-[44px] inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-sm shadow-sm transition-colors"
              >
                <Lock className="w-4 h-4" />
                <span>Upgrade Plan to Watch Videos</span>
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* YouTube Privacy-Enhanced Player (youtube-nocookie.com) */}
              <div className="aspect-video w-full max-w-4xl mx-auto rounded-xl overflow-hidden bg-black shadow-md border border-slate-200">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${selectedVideo.youtubeVideoId}?rel=0&modestbranding=1`}
                  title={selectedVideo.title?.[language as Language] || selectedVideo.title?.en}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                ></iframe>
              </div>

              {/* Video Description */}
              {(selectedVideo.description?.[language as Language] || selectedVideo.description?.en) && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {selectedVideo.description?.[language as Language] || selectedVideo.description?.en}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="space-y-6">
          {/* Section Selector Tabs */}
          <div className="flex border-b border-slate-200 gap-8">
            <button
              onClick={() => handleSectionChange('lessons')}
              className={`flex items-center gap-2 pb-3 font-bold text-sm transition-all border-b-2 relative -mb-px ${
                activeSection === 'lessons'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>{language === 'rw' ? "Amasomo y'Igazeti" : language === 'fr' ? "Leçons de la Gazette" : "Gazette Lessons"} ({lessons.length})</span>
            </button>

            <button
              onClick={() => handleSectionChange('videos')}
              className={`flex items-center gap-2 pb-3 font-bold text-sm transition-all border-b-2 relative -mb-px ${
                activeSection === 'videos'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>{language === 'rw' ? "Amavidewo yo Kwiga" : language === 'fr' ? "Vidéos Pédagogiques" : "Instructional Videos"} ({videos.length})</span>
            </button>
          </div>

          {/* Interactive Study Progress Header Banner */}
          {activeSection === 'lessons' && (
            <div className="bg-gradient-to-br from-blue-700 via-indigo-800 to-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-sm relative overflow-hidden">
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="space-y-1.5 max-w-xl">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-xs text-[11px] font-bold tracking-wide uppercase text-blue-100">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>{language === 'rw' ? "Amategeko y'Umuhanda yo mu Igazeti" : language === 'fr' ? "Code de la Route du Rwanda" : "Rwanda Official Traffic Code"}</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                    {language === 'rw' ? "Amasomo y'Amategeko y'Umuhanda" : language === 'fr' ? "Leçons Officielles de la Gazette" : "Official Gazette Lessons"}
                  </h2>
                  <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed">
                    {language === 'rw'
                      ? "Amasomo magufi yateguwe ku buryo bworoshye. Buri somo ririmo ibisobanuro n'ikizamini cyo kwisuzuma."
                      : language === 'fr'
                      ? "Leçons concises structurées par article officiel. Chaque leçon comprend des explications claires et un quiz."
                      : "Bite-sized official lessons organized for fast learning. Study each article and pass its self-assessment quiz."}
                  </p>
                </div>

                {/* Progress Card */}
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/15 w-full sm:w-[220px] sm:shrink-0 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-blue-100">
                    <span className="flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-amber-300" />
                      <span>{language === 'rw' ? "Amasomo yatsinzwe" : language === 'fr' ? "Leçons validées" : "Completed"}</span>
                    </span>
                    <span className="font-mono text-white text-sm font-bold">{progressPercent}%</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black font-mono text-white">{passedLessonsCount}</span>
                    <span className="text-xs text-blue-200 font-medium">/ {lessons.length} {language === 'rw' ? "yose" : "total"}</span>
                  </div>
                  <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, progressPercent)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Search, Filter & Quick Category Chips */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:w-80 min-h-[44px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder={language === 'rw' ? "Shakisha isomo cyangwa ingingo..." : language === 'fr' ? "Rechercher une leçon..." : "Search lessons or articles..."}
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">
                  {language === 'rw' ? "Icyiciro:" : language === 'fr' ? "Catégorie:" : "Category:"}
                </span>
                <select
                  value={categoryFilter}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="w-full sm:w-60 min-h-[44px] px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="all">
                    {language === 'rw' ? `Ibyiciro Byose (${lessons.length})` : language === 'fr' ? `Toutes les Catégories (${lessons.length})` : `All Categories (${lessons.length})`}
                  </option>
                  {allCategories.map((c) => (
                    <option key={c} value={c}>
                      {c} {categoryCounts[c] ? `(${categoryCounts[c]})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Interactive Quick Category Pills (Horizontal Chips) */}
            {activeSection === 'lessons' && allCategories.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar text-xs">
                <button
                  type="button"
                  onClick={() => handleCategoryChange('all')}
                  className={`min-h-[34px] px-3 py-1.5 rounded-lg font-semibold shrink-0 transition-all ${
                    categoryFilter === 'all'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                  }`}
                >
                  {language === 'rw' ? 'Byose' : language === 'fr' ? 'Tous' : 'All'} ({lessons.length})
                </button>

                {allCategories.slice(0, 10).map((cat) => {
                  const count = categoryCounts[cat] || 0;
                  const isActive = categoryFilter === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => handleCategoryChange(cat)}
                      className={`min-h-[34px] px-3 py-1.5 rounded-lg font-medium shrink-0 transition-all flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-2xs font-bold'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                      }`}
                    >
                      <span>{cat}</span>
                      {count > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                          isActive ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 1: GAZETTE LESSONS LIST */}
          {activeSection === 'lessons' && (
            <div className="space-y-4">
              {/* Header Pager Strip */}
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <div>
                  {language === 'rw'
                    ? <>Kwerekana <strong className="text-slate-900 font-mono">{totalLessons === 0 ? 0 : startLessonIndex + 1}–{endLessonIndex}</strong> muri <strong className="text-slate-900 font-mono">{totalLessons}</strong></>
                    : language === 'fr'
                    ? <>Affichage de <strong className="text-slate-900 font-mono">{totalLessons === 0 ? 0 : startLessonIndex + 1}–{endLessonIndex}</strong> sur <strong className="text-slate-900 font-mono">{totalLessons}</strong></>
                    : <>Showing <strong className="text-slate-900 font-mono">{totalLessons === 0 ? 0 : startLessonIndex + 1}–{endLessonIndex}</strong> of <strong className="text-slate-900 font-mono">{totalLessons}</strong> lessons</>}
                </div>

                {totalLessonPages > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-600 font-medium hidden sm:inline">
                      {language === 'rw' ? 'Ipaji' : language === 'fr' ? 'Page' : 'Page'} {safeLessonPage} / {totalLessonPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => goToPage(safeLessonPage - 1)}
                      disabled={safeLessonPage <= 1}
                      aria-label="Previous Page"
                      className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => goToPage(safeLessonPage + 1)}
                      disabled={safeLessonPage >= totalLessonPages}
                      aria-label="Next Page"
                      className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-36 bg-white rounded-2xl border border-slate-200 animate-pulse"></div>
                  ))}
                </div>
              ) : filteredLessons.length === 0 ? (
                <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
                  <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
                  <h4 className="font-bold text-slate-900 text-base">
                    {language === 'rw' ? "Nta masomo yabonetse" : language === 'fr' ? "Aucune leçon trouvée" : "No Lessons Found"}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {language === 'rw' ? "Hindura icyiciro cyangwa usukure ibyo washakishije." : language === 'fr' ? "Essayez une autre catégorie ou effacez la recherche." : "Try selecting a different category or clearing your search."}
                  </p>
                </div>
              ) : (
                /* Attractive 2-Column Responsive Card Grid (8 cards per page - NO endless scroll) */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {paginatedLessons.map((lesson, idx) => {
                    const isLocked = !hasTrafficRulesAccess;
                    const localizedTitle =
                      lesson.title?.[language as Language] || lesson.title?.en || lesson.title?.rw || 'Lesson';
                    const hasPassed = progressMap[lesson.id]?.passed;

                    return (
                      <div
                        key={`${lesson.id}-${idx}`}
                        onClick={() => handleSelectLesson(lesson)}
                        className={`group p-4 sm:p-5 rounded-2xl border bg-white shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-3.5 ${
                          isLocked
                            ? 'border-slate-200 hover:border-amber-300'
                            : hasPassed
                            ? 'border-emerald-200 hover:border-emerald-400 bg-gradient-to-br from-white to-emerald-50/20'
                            : 'border-slate-200 hover:border-blue-400'
                        }`}
                      >
                        {/* Top Card Row */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold font-mono ${
                              hasPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {lesson.category || 'Article'}
                            </span>
                            {lesson.gazetteReference && (
                              <span className="text-[11px] font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                                {lesson.gazetteReference}
                              </span>
                            )}
                          </div>

                          {/* Status Pill */}
                          {hasPassed ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full shrink-0">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{language === 'rw' ? 'Byarangiye' : language === 'fr' ? 'Réussi' : 'Passed'}</span>
                            </span>
                          ) : isLocked ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full shrink-0">
                              <Lock className="w-3.5 h-3.5" />
                              <span>{language === 'rw' ? 'Bifunze' : language === 'fr' ? 'Verrouillé' : 'Locked'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 shrink-0">
                              <Clock className="w-3 h-3" />
                              <span>~3 min</span>
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <div>
                          <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-snug group-hover:text-blue-600 transition-colors line-clamp-2">
                            {localizedTitle}
                          </h3>
                        </div>

                        {/* Bottom Action Footer */}
                        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                            <span>{language === 'rw' ? 'Isomo rirambuye' : language === 'fr' ? 'Leçon officielle' : 'Official lesson'}</span>
                          </span>

                          <div className={`inline-flex items-center gap-1 font-semibold transition-colors ${
                            isLocked ? 'text-amber-700' : 'text-blue-600 group-hover:text-blue-700'
                          }`}>
                            <span>
                              {isLocked 
                                ? (language === 'rw' ? 'Fungura' : language === 'fr' ? 'Débloquer' : 'Unlock') 
                                : (language === 'rw' ? 'Tangira Kwiga' : language === 'fr' ? 'Étudier' : 'Study Lesson')}
                            </span>
                            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bottom Numeric Pagination Bar */}
              {totalLessonPages > 1 && (
                <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-2xs mt-4">
                  <span className="text-slate-500 font-medium">
                    {language === 'rw'
                      ? <>Ipaji <strong className="text-slate-900 font-mono">{safeLessonPage}</strong> kuri <strong className="text-slate-900 font-mono">{totalLessonPages}</strong></>
                      : language === 'fr'
                      ? <>Page <strong className="text-slate-900 font-mono">{safeLessonPage}</strong> sur <strong className="text-slate-900 font-mono">{totalLessonPages}</strong></>
                      : <>Page <strong className="text-slate-900 font-mono">{safeLessonPage}</strong> of <strong className="text-slate-900 font-mono">{totalLessonPages}</strong></>}
                  </span>

                  <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50/50 p-1">
                    <button
                      type="button"
                      onClick={() => goToPage(safeLessonPage - 1)}
                      disabled={safeLessonPage <= 1}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-semibold text-slate-700 hover:bg-white disabled:opacity-25 disabled:pointer-events-none transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span className="hidden sm:inline">{language === 'rw' ? 'Ibyabanje' : language === 'fr' ? 'Précédent' : 'Previous'}</span>
                    </button>

                    {/* Numeric page pills */}
                    <div className="flex items-center px-1 border-x border-slate-200 gap-1">
                      {Array.from({ length: totalLessonPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalLessonPages || Math.abs(p - safeLessonPage) <= 1)
                        .map((pageNum, idx, arr) => {
                          const prevPageNum = arr[idx - 1];
                          const showEllipsis = prevPageNum && pageNum - prevPageNum > 1;
                          return (
                            <React.Fragment key={pageNum}>
                              {showEllipsis && <span className="px-1 text-slate-300">…</span>}
                              <button
                                type="button"
                                onClick={() => goToPage(pageNum)}
                                className={`w-8 h-8 flex items-center justify-center rounded-lg font-mono text-xs font-bold transition-all ${
                                  safeLessonPage === pageNum
                                    ? 'bg-blue-600 text-white shadow-2xs'
                                    : 'text-slate-600 hover:bg-white'
                                }`}
                              >
                                {pageNum}
                              </button>
                            </React.Fragment>
                          );
                        })}
                    </div>

                    <button
                      type="button"
                      onClick={() => goToPage(safeLessonPage + 1)}
                      disabled={safeLessonPage >= totalLessonPages}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-semibold text-slate-700 hover:bg-white disabled:opacity-25 disabled:pointer-events-none transition-colors"
                    >
                      <span className="hidden sm:inline">{language === 'rw' ? 'Ibikurikira' : language === 'fr' ? 'Suivant' : 'Next'}</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: VIDEO TUTORIALS LIST */}
          {activeSection === 'videos' && (
            <div className="space-y-4">
              {/* Header Pager Strip */}
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <div>
                  {language === 'rw'
                    ? <>Kwerekana <strong className="text-slate-900 font-mono">{videos.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, videos.length)}</strong> muri <strong className="text-slate-900 font-mono">{videos.length}</strong></>
                    : language === 'fr'
                    ? <>Affichage de <strong className="text-slate-900 font-mono">{videos.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, videos.length)}</strong> sur <strong className="text-slate-900 font-mono">{videos.length}</strong></>
                    : <>Showing <strong className="text-slate-900 font-mono">{videos.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, videos.length)}</strong> of <strong className="text-slate-900 font-mono">{videos.length}</strong> videos</>}
                </div>

                {Math.max(1, Math.ceil(videos.length / pageSize)) > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-600 font-medium hidden sm:inline">
                      {language === 'rw' ? 'Ipaji' : language === 'fr' ? 'Page' : 'Page'} {Math.min(currentPage, Math.max(1, Math.ceil(videos.length / pageSize)))} / {Math.max(1, Math.ceil(videos.length / pageSize))}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage <= 1}
                      className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(videos.length / pageSize)))}
                      disabled={currentPage >= Math.ceil(videos.length / pageSize)}
                      className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-48 bg-white rounded-2xl border border-slate-200 animate-pulse"></div>
                  ))}
                </div>
              ) : videos.length === 0 ? (
                <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
                  <Video className="w-10 h-10 text-slate-300 mx-auto" />
                  <h4 className="font-bold text-slate-900 text-base">
                    {language === 'rw' ? "Nta mavidewo yabonetse" : language === 'fr' ? "Aucune vidéo trouvée" : "No Video Tutorials Found"}
                  </h4>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {videos.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((video, idx) => {
                    const isLocked = !hasLessonVideosAccess && !video.isFreePreview;
                    const localizedTitle =
                      video.title?.[language as Language] || video.title?.en || video.title?.rw || 'Video';

                    return (
                      <div
                        key={`${video.id}-${idx}`}
                        onClick={() => handleSelectVideo(video)}
                        className={`bg-white rounded-2xl border overflow-hidden shadow-2xs transition-all cursor-pointer flex flex-col ${
                          isLocked
                            ? 'opacity-90 border-slate-200 hover:border-purple-300'
                            : 'hover:border-purple-400 hover:shadow-xs'
                        }`}
                      >
                        {/* Thumbnail Banner */}
                        <div className="relative aspect-video bg-slate-900 w-full overflow-hidden group">
                          <img
                            src={video.thumbnail}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                            <div className="w-12 h-12 rounded-full bg-white/90 text-purple-700 flex items-center justify-center shadow-md">
                              {isLocked ? <Lock className="w-5 h-5" /> : <Play className="w-5 h-5 fill-purple-700 ml-0.5" />}
                            </div>
                          </div>
                          {video.isFreePreview && (
                            <span className="absolute top-2 left-2 bg-emerald-600 text-white text-[10px] font-bold uppercase px-2 py-0.5 rounded shadow-xs">
                              Free Preview
                            </span>
                          )}
                        </div>

                        {/* Card Content */}
                        <div className="p-4 flex-1 flex flex-col justify-between space-y-2">
                          <div>
                            <h3 className="font-bold text-slate-900 text-sm line-clamp-2">
                              {localizedTitle}
                            </h3>
                          </div>

                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                            <span>#{video.order}</span>
                            {isLocked ? (
                              <span className="text-amber-700 font-semibold flex items-center gap-1">
                                <Lock className="w-3 h-3" /> Locked
                              </span>
                            ) : (
                              <span className="text-purple-600 font-semibold flex items-center gap-1">
                                Watch Tutorial <ChevronRight className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Subscription Upgrade Modal */}
      <SubscriptionModal
        isOpen={isSubModalOpen}
        onClose={() => setIsSubModalOpen(false)}
        onSubscribed={() => {
          checkSubAndFetch();
          setIsSubModalOpen(false);
        }}
      />
    </div>
  );
};
