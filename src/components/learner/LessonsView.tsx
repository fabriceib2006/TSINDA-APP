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
  RefreshCw
} from 'lucide-react';
import { SubscriptionModal } from './SubscriptionModal';
import { RichTextRenderer } from '../common/RichTextRenderer';

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
                          {q.imageUrl && (
                            <div className="rounded-lg overflow-hidden border border-slate-200 max-w-xs bg-slate-50">
                              <img src={q.imageUrl} alt="" className="w-full h-36 object-contain p-1" />
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
                                  className={`w-full text-left p-3 rounded-lg border text-xs sm:text-sm font-medium transition-all flex items-center gap-3 ${
                                    isSelected
                                      ? 'bg-blue-50 border-blue-600 text-blue-900'
                                      : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                                  }`}
                                >
                                  <span className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 text-xs font-bold ${
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
                        return (
                          <div key={resItem.questionId} className={`p-4 rounded-xl border space-y-2 ${
                            resItem.isCorrect ? 'bg-emerald-50/40 border-emerald-200' : 'bg-rose-50/40 border-rose-200'
                          }`}>
                            <div className="font-bold text-slate-900 text-xs sm:text-sm flex items-start gap-2">
                              {resItem.isCorrect ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
                              <span>#{rIdx + 1} {qObj?.text}</span>
                            </div>
                            <div className="text-xs space-y-1 pl-6">
                              <div>Your Answer: <span className={resItem.isCorrect ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>{qObj?.options?.[resItem.userAnswer] ?? 'None'}</span></div>
                              {!resItem.isCorrect && (
                                <div className="text-emerald-800 font-medium">Correct Answer: {qObj?.options?.[resItem.correctIndex]}</div>
                              )}
                              {resItem.explanation && (
                                <div className="mt-2 p-3 bg-white/80 rounded-lg border border-slate-200 text-slate-700 text-xs">
                                  <span className="font-semibold text-slate-900">Explanation:</span> {typeof resItem.explanation === 'object' ? (resItem.explanation[language] || resItem.explanation.en) : resItem.explanation}
                                </div>
                              )}
                            </div>
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
              onClick={() => {
                setActiveSection('lessons');
                setSearchQuery('');
              }}
              className={`flex items-center gap-2 pb-3 font-bold text-sm transition-all border-b-2 relative -mb-px ${
                activeSection === 'lessons'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Gazette Lessons ({lessons.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveSection('videos');
                setSearchQuery('');
              }}
              className={`flex items-center gap-2 pb-3 font-bold text-sm transition-all border-b-2 relative -mb-px ${
                activeSection === 'videos'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>Instructional Videos ({videos.length})</span>
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
                placeholder={`Search ${activeSection}...`}
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
                {allCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* SECTION 1: GAZETTE LESSONS LIST */}
          {activeSection === 'lessons' && (
            <div className="space-y-3">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-20 bg-white rounded-xl border border-slate-200 animate-pulse"></div>
                  ))}
                </div>
              ) : filteredLessons.length === 0 ? (
                <div className="p-12 text-center bg-white rounded-xl border border-slate-200 space-y-2">
                  <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
                  <h4 className="font-bold text-slate-900 text-base">No Lessons Found</h4>
                  <p className="text-xs text-slate-500">Try selecting a different category or clearing your search.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredLessons.map((lesson) => {
                    const isLocked = !hasTrafficRulesAccess;
                    const localizedTitle =
                      lesson.title?.[language as Language] || lesson.title?.en || lesson.title?.rw || 'Lesson';
                    const hasPassed = progressMap[lesson.id]?.passed;

                    return (
                      <div
                        key={lesson.id}
                        onClick={() => handleSelectLesson(lesson)}
                        className={`p-4 rounded-xl border bg-white shadow-2xs transition-all cursor-pointer flex items-center justify-between gap-4 ${
                          isLocked
                            ? 'opacity-85 border-slate-200 hover:border-amber-300'
                            : 'hover:border-blue-300 hover:shadow-xs'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div
                            className={`w-11 h-11 rounded-[10px] flex items-center justify-center shrink-0 ${
                              isLocked
                                ? 'bg-amber-50 text-amber-600'
                                : 'bg-blue-50 text-blue-600'
                            }`}
                          >
                            {isLocked ? <Lock className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                {lesson.category}
                              </span>
                              {lesson.gazetteReference && (
                                <span className="text-[10px] font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                  {lesson.gazetteReference}
                                </span>
                              )}
                              {hasPassed && (
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Passed</span>
                                </span>
                              )}
                            </div>
                            <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate mt-0.5">
                              {localizedTitle}
                            </h3>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isLocked ? (
                            <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                              <Lock className="w-3.5 h-3.5" />
                              <span>Locked</span>
                            </span>
                          ) : (
                            <ChevronRight className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                      </div>
                    );
                  })}
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
                <div className="p-12 text-center bg-white rounded-xl border border-slate-200 space-y-2">
                  <Video className="w-10 h-10 text-slate-300 mx-auto" />
                  <h4 className="font-bold text-slate-900 text-base">No Video Tutorials Found</h4>
                  <p className="text-xs text-slate-500">Try selecting a different category or clearing your search.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredVideos.map((video) => {
                    const isLocked = !hasLessonVideosAccess && !video.isFreePreview;
                    const localizedTitle =
                      video.title?.[language as Language] || video.title?.en || video.title?.rw || 'Video';

                    return (
                      <div
                        key={video.id}
                        onClick={() => handleSelectVideo(video)}
                        className={`bg-white rounded-xl border overflow-hidden shadow-2xs transition-all cursor-pointer flex flex-col ${
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
