import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { Lesson, VideoLesson, Language, CombinedAccess } from '../../types';
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

  const checkSubAndFetch = async () => {
    if (!userProfile) return;
    try {
      // 1. Fetch user subscriptions and compute combined access
      const subsSnap = await getDocs(
        query(collection(db, 'subscriptions'), where('userId', '==', userProfile.uid))
      ).catch(() => null);

      if (subsSnap) {
        const subs = subsSnap.docs.map((d) => normalizeSubscription(d.data(), d.id));
        const combined = getCombinedAccess(subs);
        setAccess(combined);
      } else {
        setAccess(getCombinedAccess([]));
      }

      // 2. Fetch user progress
      const progressSnap = await getDocs(
        collection(db, 'users', userProfile.uid, 'progress')
      ).catch(() => null);
      if (progressSnap) {
        const pMap: Record<string, any> = {};
        progressSnap.docs.forEach(d => {
          pMap[d.id] = d.data();
        });
        setProgressMap(pMap);
      }

      // 3. Fetch published lessons
      const lSnap = await getDocs(query(collection(db, 'lessons'), orderBy('order', 'asc'))).catch((err) => {
        handleFirestoreError(err, OperationType.LIST, 'lessons');
        return null;
      });
      if (lSnap) {
        const list = lSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Lesson))
          .filter((l) => l.isPublished);
        setLessons(list);
      }

      // 4. Fetch published videos
      const vSnap = await getDocs(query(collection(db, 'videos'), orderBy('order', 'asc'))).catch((err) => {
        handleFirestoreError(err, OperationType.LIST, 'videos');
        return null;
      });
      if (vSnap) {
        const vList = vSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as VideoLesson))
          .filter((v) => v.isPublished);
        setVideos(vList);
      }
    } catch (err) {
      console.error('Error loading lessons and videos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSubAndFetch();
  }, [userProfile]);

  // Categories list
  const allCategories = Array.from(
    new Set([
      ...lessons.map((l) => l.category),
      ...videos.map((v) => v.category),
    ])
  ).filter(Boolean);

  // Access checks based on plan rules
  const hasTrafficRulesAccess = Boolean(access?.trafficRules);
  const hasLessonVideosAccess = Boolean(access?.lessonVideos);

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
          <span>{selectedLesson || selectedVideo ? 'Back to Content List' : 'Back to Dashboard'}</span>
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
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                  {selectedLesson.category}
                </span>
                {selectedLesson.gazetteReference && (
                  <span className="text-xs font-mono font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
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

            <button
              onClick={() => setSelectedLesson(null)}
              className="min-h-[40px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-[8px] text-xs transition-colors"
            >
              Close
            </button>
          </div>

          {/* Locked Check for Lesson */}
          {!hasTrafficRulesAccess ? (
            <div className="p-8 sm:p-12 text-center bg-slate-50 rounded-xl border border-slate-200 space-y-4">
              <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                <Lock className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900">Traffic Rules Lesson Locked</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  This Rwanda Gazette traffic lesson requires an active study pass with traffic rules access.
                </p>
              </div>
              <button
                onClick={() => setIsSubModalOpen(true)}
                className="min-h-[44px] inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-sm shadow-sm transition-colors"
              >
                <Lock className="w-4 h-4" />
                <span>Upgrade Plan to Read Full Lesson</span>
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Rich Body Content (Headings, Lists, Bold, Tables) */}
              <RichTextRenderer
                content={selectedLesson.body?.[language as Language] || selectedLesson.body?.en || selectedLesson.body?.rw || ''}
              />

              {/* Uploaded Gazette Diagrams / Images Gallery */}
              {selectedLesson.images && selectedLesson.images.length > 0 && (
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-blue-600" />
                    <span>Official Gazette Diagrams & Signs</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {selectedLesson.images.map((imgUrl, i) => (
                      <div key={i} className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 shadow-2xs">
                        <img
                          src={imgUrl}
                          alt="Gazette diagram"
                          className="w-full h-48 object-contain bg-white p-2"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* LESSON QUIZ SECTION */}
              <div className="mt-8 pt-6 border-t border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-blue-600" />
                    <span>{language === 'rw' ? "Ikizamini cy'iyi Nyigisho" : language === 'fr' ? "Quiz de la Leçon" : "Lesson Quiz"}</span>
                  </h3>
                  {progressMap[selectedLesson.id]?.passed && (
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>{language === 'rw' ? "Quiz Yatsinzwe" : language === 'fr' ? "Quiz Réussi" : "Quiz Passed"}</span>
                    </span>
                  )}
                </div>

                {noQuizYet ? (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-600 text-center">
                    {language === 'rw' ? "Nta kizamini cy'iyi nyigisho kirajyaho." : language === 'fr' ? "Pas encore de quiz pour cette leçon." : "No quiz for this lesson yet."}
                  </div>
                ) : quizState === 'idle' ? (
                  <div className="p-6 bg-blue-50/60 rounded-xl border border-blue-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="space-y-1 text-center sm:text-left">
                      <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                        {language === 'rw' ? "Witeguye kwitoza kuri iyi nyigisho?" : language === 'fr' ? "Prêt à faire le quiz de cette leçon ?" : "Take the quiz for this lesson"}
                      </h4>
                      <p className="text-xs text-slate-600">
                        {language === 'rw' ? "Gerageza ubumenyi bwawe n'ibibazo byihariye by'iyi nyigisho." : language === 'fr' ? "Testez vos connaissances avec les questions de cette leçon." : "Test your understanding with questions specific to this lesson."}
                      </p>
                    </div>
                    <button
                      onClick={handleStartLessonQuiz}
                      disabled={quizLoading}
                      className="min-h-[44px] px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-xs sm:text-sm shadow-sm transition-colors shrink-0 disabled:opacity-50"
                    >
                      {quizLoading ? 'Loading...' : (language === 'rw' ? "Fata Ikizamini cy'Iyi Nyigisho" : language === 'fr' ? "Passer le Quiz" : "Take the quiz for this lesson")}
                    </button>
                  </div>
                ) : quizState === 'active' ? (
                  <div className="space-y-6 bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <div className="flex justify-between items-center text-xs font-semibold text-slate-600 border-b border-slate-200 pb-3">
                      <span>{quizQuestions.length} Questions</span>
                      <span className="text-blue-600">Pass mark: 70%</span>
                    </div>

                    <div className="space-y-6">
                      {quizQuestions.map((q, idx) => (
                        <div key={q.id} className="bg-white p-5 rounded-xl border border-slate-200 space-y-3 shadow-2xs">
                          <div className="font-bold text-slate-900 text-sm sm:text-base flex gap-2">
                            <span className="text-blue-600">#{idx + 1}</span>
                            <span>{q.text}</span>
                          </div>
                          {Array.isArray(q.images) && q.images.length > 0 ? (
                            <div className="flex flex-wrap gap-2 pt-1">
                              {q.images.map((imgUrl: string, i: number) => (
                                <img
                                  key={i}
                                  src={imgUrl}
                                  alt=""
                                  onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                                  className="max-h-36 rounded-lg border border-slate-200 bg-slate-50 object-contain p-1"
                                />
                              ))}
                            </div>
                          ) : q.imageUrl ? (
                            <div className="rounded-lg overflow-hidden border border-slate-200 max-w-xs bg-slate-50">
                              <img
                                src={q.imageUrl}
                                alt=""
                                onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                                className="w-full h-36 object-contain p-1"
                              />
                            </div>
                          ) : null}
                          <div className="grid grid-cols-1 gap-2 pt-2">
                            {(q.options || []).map((opt: string, optIdx: number) => {
                              const isSelected = quizAnswers[q.id] === optIdx;
                              const optLetter = ['a', 'b', 'c', 'd'][optIdx];
                              const optImg = q.optionImages?.[optLetter];
                              return (
                                <button
                                  key={optIdx}
                                  type="button"
                                  onClick={() => handleQuizAnswer(q.id, optIdx)}
                                  className={`w-full text-left p-3 rounded-lg border text-xs sm:text-sm font-medium transition-all flex items-start gap-3 ${
                                    isSelected
                                      ? 'bg-blue-50 border-blue-600 text-blue-900'
                                      : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                                  }`}
                                >
                                  <span className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 text-xs font-bold mt-0.5 ${
                                    isSelected ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-500'
                                  }`}>
                                    {String.fromCharCode(65 + optIdx)}
                                  </span>
                                  <div className="flex-1 space-y-1">
                                    {opt && <span>{opt}</span>}
                                    {optImg && (
                                      <img
                                        src={optImg}
                                        alt={`Option ${String.fromCharCode(65 + optIdx)} illustration`}
                                        onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                                        className="max-h-20 rounded-md border bg-slate-50 object-contain mt-1"
                                      />
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                      <button
                        onClick={() => setQuizState('idle')}
                        className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-[10px] text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleQuizSubmit}
                        disabled={quizLoading || Object.keys(quizAnswers).length === 0}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-xs shadow-sm disabled:opacity-50"
                      >
                        {quizLoading ? 'Submitting...' : 'Submit Quiz'}
                      </button>
                    </div>
                  </div>
                ) : quizState === 'submitted' && quizResult ? (
                  <div className="space-y-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className={`p-6 rounded-xl text-center space-y-2 ${
                      quizResult.passed ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-amber-50 border border-amber-200 text-amber-900'
                    }`}>
                      <div className="text-2xl font-bold">
                        {quizResult.passed ? (language === 'rw' ? "Watsinze Ikizamini!" : language === 'fr' ? "Quiz Réussi !" : "Quiz Passed Successfully!") : (language === 'rw' ? "Ntibihagije, Ongera ugerageze" : language === 'fr' ? "Réessayez" : "Keep practicing!")}
                      </div>
                      <p className="text-sm font-medium">
                        Score: <span className="font-bold">{quizResult.score}</span> / {quizResult.total} ({quizResult.percent}%) — Pass mark: 70%
                      </p>
                    </div>

                    {/* Results review with correct answers and explanations */}
                    <div className="space-y-4">
                      <h4 className="font-bold text-slate-900 text-sm">Detailed Review & Explanations</h4>
                      {quizResult.results.map((resItem: any, rIdx: number) => {
                        const qObj = quizQuestions.find(q => q.id === resItem.questionId);
                        const optData = qObj ? getLocalizedQuestionOptions(qObj, language) : { options: [] };
                        const explData = qObj ? getLocalizedQuestionExplanation(qObj, language) : { explanation: '' };

                        return (
                          <div key={resItem.questionId} className={`p-5 rounded-2xl border ${resItem.isCorrect ? 'border-emerald-200 bg-emerald-50/30' : 'border-rose-200 bg-rose-50/30'} space-y-4`}>
                            <div className="font-bold text-slate-900 text-sm flex gap-2">
                              <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs shrink-0">{rIdx + 1}</span>
                              <span className="leading-relaxed">{qObj?.text}</span>
                            </div>
                            {/* Question Images */}
                            {Array.isArray(qObj?.images) && qObj.images.length > 0 && (
                              <div className="flex flex-wrap gap-2 pl-8">
                                {qObj.images.map((imgUrl: string, i: number) => <img key={i} src={imgUrl} alt="" className="max-h-36 rounded-lg border bg-slate-50 object-contain p-1" />)}
                              </div>
                            )}
                            {/* Options */}
                            <div className="grid grid-cols-1 gap-2 pl-8">
                              {(qObj?.options || []).map((opt: string, optIdx: number) => {
                                const isCorrect = optIdx === resItem.correctIndex;
                                const isUserAnswer = optIdx === resItem.userAnswer;
                                const optLetter = ['a', 'b', 'c', 'd'][optIdx];
                                const optImg = qObj?.optionImages?.[optLetter];
                                return (
                                  <div key={optIdx} className={`p-3 rounded-lg border ${isCorrect ? 'border-emerald-500 bg-emerald-50' : isUserAnswer ? 'border-rose-500 bg-rose-50' : 'border-slate-200 bg-white'}`}>
                                    <div className="flex items-start gap-3">
                                      <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${isCorrect ? 'bg-emerald-500 text-white' : isUserAnswer ? 'bg-rose-500 text-white' : 'border border-slate-300 text-slate-500'}`}>
                                        {String.fromCharCode(65 + optIdx)}
                                      </span>
                                      <div className="flex-1 space-y-1">
                                        <span>{opt}</span>
                                        {optImg && <img src={optImg} alt="" className="max-h-20 rounded-md border bg-slate-50 object-contain mt-1" />}
                                      </div>
                                      {isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
                                      {isUserAnswer && !isCorrect && <XCircle className="w-5 h-5 text-rose-600 shrink-0" />}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {/* Explanation */}
                            {explData.explanation && (
                              <div className="pl-8 pt-2 border-t border-slate-200/50">
                                <h4 className="text-xs font-bold text-slate-800 mb-1">
                                  {language === 'rw' ? 'Ibisobanuro' : language === 'fr' ? 'Explication' : 'Explanation'}
                                </h4>
                                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{explData.explanation}</p>
                              </div>
                            )}
                            {/* Article Link */}
                            {qObj?.article_id && (
                              <div className="pl-8 pt-2">
                                <button 
                                  onClick={() => {
                                    const lesson = lessons.find(l => l.id === qObj.article_id);
                                    if (lesson) handleSelectLesson(lesson);
                                  }}
                                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                >
                                  {language === 'rw' ? `Soma itegeko: Article ${qObj.article_id}` : language === 'fr' ? `Lire la règle: Article ${qObj.article_id}` : `Read the rule: Article ${qObj.article_id}`}
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                      <button
                        onClick={() => setQuizState('idle')}
                        className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-[10px] text-xs"
                      >
                        Back to Lesson
                      </button>
                      <button
                        onClick={handleStartLessonQuiz}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-xs shadow-sm flex items-center gap-2"
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
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/15 min-w-[210px] shrink-0 space-y-2">
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

          {/* SECTION 2: VIDEOS LIST */}
          {activeSection === 'videos' && (
            <div className="space-y-3">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse"></div>
                  ))}
                </div>
              ) : filteredVideos.length === 0 ? (
                <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
                  <Video className="w-10 h-10 text-slate-300 mx-auto" />
                  <h4 className="font-bold text-slate-900 text-base">
                    {language === 'rw' ? "Nta mavidewo yabonetse" : language === 'fr' ? "Aucune vidéo trouvée" : "No Video Tutorials Found"}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {language === 'rw' ? "Hindura icyiciro cyangwa usukure ibyo washakishije." : language === 'fr' ? "Essayez une autre catégorie ou effacez la recherche." : "Try selecting a different category or clearing your search."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredVideos.map((video, idx) => {
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
                            <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded inline-block mb-1">
                              {video.category}
                            </span>
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
