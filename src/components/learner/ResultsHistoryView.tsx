import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, query } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Language } from '../../types';
import { 
  Award, 
  ArrowLeft, 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  RefreshCw, 
  Clock, 
  TrendingUp, 
  BarChart3, 
  Eye, 
  Check, 
  X, 
  Filter, 
  BookOpen, 
  ShieldCheck, 
  HelpCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { ExamAttemptReviewView } from './ExamAttemptReviewView';

interface QuestionReviewItem {
  index: number;
  questionId: string;
  text: any;
  options: any;
  userAnswer: number | null;
  correctIndex: number;
  isCorrect: boolean;
  explanation: any;
  category?: string;
  categoryName?: any;
  imageUrl?: string | null;
}

interface ExamCategoryStat {
  categoryId: string;
  categoryName: any;
  total: number;
  correct: number;
  accuracy: number;
}

interface ExamResultItem {
  id: string;
  attemptId: string;
  date: string;
  submittedAt?: string;
  durationSeconds: number;
  score: number;
  total: number;
  passMark: number;
  passed: boolean;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  questions?: QuestionReviewItem[];
  categoryStats?: ExamCategoryStat[];
}

interface UserPerformanceSummary {
  totalExams: number;
  passedExams: number;
  failedExams: number;
  passRate: number;
  averageScore: number;
  bestScore: number;
}

interface CategoryMasteryItem {
  categoryId: string;
  categoryName: any;
  total: number;
  correct: number;
  accuracy: number;
}

export const ResultsHistoryView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { userProfile, firebaseUser } = useAuth();
  const { language } = useLanguage();

  const [results, setResults] = useState<ExamResultItem[]>([]);
  const [summary, setSummary] = useState<UserPerformanceSummary>({
    totalExams: 0,
    passedExams: 0,
    failedExams: 0,
    passRate: 0,
    averageScore: 0,
    bestScore: 0
  });
  const [categoryMastery, setCategoryMastery] = useState<CategoryMasteryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Review Modal
  const [statusFilter, setStatusFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [selectedExamToReview, setSelectedExamToReview] = useState<ExamResultItem | null>(null);
  const [questionReviewFilter, setQuestionReviewFilter] = useState<'all' | 'wrong' | 'correct'>('all');

  // Pagination (Email design: 5 attempts per page)
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Multi-language translation dictionary
  const t = {
    backToDashboard: {
      rw: 'Gusubira ku Rubuga Nyamukuru',
      en: 'Back to Dashboard',
      fr: 'Retour au Tableau de Bord'
    }[language],
    pageTitle: {
      rw: "Amateka n'Isesengura ry'Ibizamini",
      en: 'Exam History & Performance Analysis',
      fr: 'Historique et Analyse des Examens'
    }[language],
    pageSubtitle: {
      rw: "Sesengura ibizamini byose wakoze, reba aho watsinze neza n'ibibazo ugomba kongera kwitoza.",
      en: 'Review all your mock exam attempts, track your score growth, and inspect question-by-question explanations.',
      fr: 'Consultez toutes vos tentatives d’examens, suivez vos progrès et examinez les explications question par question.'
    }[language],
    passRate: {
      rw: 'Gutsinda',
      en: 'Pass Rate',
      fr: 'Taux de Réussite'
    }[language],
    totalExams: {
      rw: 'Ibizamini Byakozwe',
      en: 'Exams Completed',
      fr: 'Examens Complétés'
    }[language],
    averageScore: {
      rw: "Ikigereranyo cy'Amanota",
      en: 'Average Score',
      fr: 'Score Moyen'
    }[language],
    bestScore: {
      rw: 'Amanota Meza Cyane',
      en: 'Best Score',
      fr: 'Meilleur Score'
    }[language],
    passMarkRequired: {
      rw: 'Amanota asabwa: 12 / 20 (60%)',
      en: 'Pass requirement: 12 / 20 (60%)',
      fr: 'Note requise: 12 / 20 (60%)'
    }[language],
    passedCount: {
      rw: 'Ibyatsinzwe',
      en: 'Passed',
      fr: 'Réussis'
    }[language],
    failedCount: {
      rw: 'Ibitatsinzwe',
      en: 'Failed',
      fr: 'Échoués'
    }[language],
    topicMasteryTitle: {
      rw: "Ubumenyi ku Ngingo z'Amategeko y'Umuhanda",
      en: 'Topic & Category Mastery',
      fr: 'Maîtrise par Thématique du Code'
    }[language],
    topicMasterySubtitle: {
      rw: "Aho uhagaze mu byapa, ubutambike, umuvuduko n'amategeko rusange.",
      en: 'Your cumulative accuracy across signs, priority rules, speed limits, and traffic codes.',
      fr: 'Votre précision cumulée sur les panneaux, les priorités, la vitesse et le code.'
    }[language],
    colDate: {
      rw: "Itariki n'Igihe",
      en: 'Date & Time',
      fr: 'Date & Heure'
    }[language],
    colScore: {
      rw: 'Amanota',
      en: 'Score',
      fr: 'Score'
    }[language],
    colStatus: {
      rw: 'Ibisubizo',
      en: 'Status',
      fr: 'Statut'
    }[language],
    colBreakdown: {
      rw: 'Ibyo Watsinze / Ibyo Wishe',
      en: 'Answers Breakdown',
      fr: 'Détail des Réponses'
    }[language],
    colDuration: {
      rw: 'Igihe Byatwaye',
      en: 'Duration',
      fr: 'Durée'
    }[language],
    colAction: {
      rw: 'Isesengura',
      en: 'Analysis',
      fr: 'Analyse'
    }[language],
    statusPassed: {
      rw: 'WATSINZE',
      en: 'PASSED',
      fr: 'RÉUSSI'
    }[language],
    statusFailed: {
      rw: 'NTIWATSINZE',
      en: 'FAILED',
      fr: 'ÉCHOUÉ'
    }[language],
    inspectBtn: {
      rw: 'Sesengura & Reba Ibisubizo',
      en: 'Analyze & Review',
      fr: 'Analyser l\'examen'
    }[language],
    filterAll: {
      rw: 'Byose',
      en: 'All',
      fr: 'Tous'
    }[language],
    filterPassed: {
      rw: 'Ibyatsinzwe',
      en: 'Passed',
      fr: 'Réussis'
    }[language],
    filterFailed: {
      rw: 'Ibitatsinzwe',
      en: 'Failed',
      fr: 'Échoués'
    }[language],
    modalTitle: {
      rw: "Isesengura Ryimbitse ry'Ikizamini",
      en: 'In-Depth Exam Attempt Analysis',
      fr: "Analyse Détaillée de la Tentative d'Examen"
    }[language],
    tabAllQuestions: {
      rw: 'Ibibazo Byose',
      en: 'All Questions',
      fr: 'Toutes les Questions'
    }[language],
    tabMistakesOnly: {
      rw: 'Amakosa Gusa',
      en: 'Mistakes Only',
      fr: 'Erreurs Seulement'
    }[language],
    tabCorrectOnly: {
      rw: 'Ibyakozwe Neza',
      en: 'Correct Only',
      fr: 'Correctes Seulement'
    }[language],
    yourChoice: {
      rw: 'Icyo wahisemo',
      en: 'Your Choice',
      fr: 'Votre Choix'
    }[language],
    correctChoice: {
      rw: 'Igisubizo Nyacyo',
      en: 'Correct Answer',
      fr: 'Bonne Réponse'
    }[language],
    explanationLabel: {
      rw: 'Ibisobanuro Nyakuri',
      en: 'Explanation',
      fr: 'Explication'
    }[language],
    categoryLabel: {
      rw: 'Ingingo',
      en: 'Topic',
      fr: 'Thème'
    }[language],
    questionLabel: {
      rw: 'Ikibazo',
      en: 'Question',
      fr: 'Question'
    }[language],
    closeModalBtn: {
      rw: 'Funga Isesengura',
      en: 'Close Analysis',
      fr: 'Fermer l\'analyse'
    }[language],
    noExamsTitle: {
      rw: 'Nta bizamini birakorwa',
      en: 'No exam attempts yet',
      fr: 'Aucun examen passé pour l\'instant'
    }[language],
    noExamsSubtitle: {
      rw: "Kora ikizamini cya mbere cy'igerageza kugira ngo wisuzume kandi urebe amateka y'amanota yawe hano.",
      en: 'Take your first official mock exam simulation to test your traffic knowledge and see your score history here.',
      fr: 'Passez votre premier examen blanc pour tester vos connaissances et voir votre historique ici.'
    }[language],
    noQuestionsInFilter: {
      rw: 'Nta bibazo biboneka muri iki cyiciro wahisemo.',
      en: 'No questions match this filter.',
      fr: 'Aucune question ne correspond à ce filtre.'
    }[language],
    showingPagination: {
      rw: 'Kwerekana',
      en: 'Showing',
      fr: 'Affichage'
    }[language],
    ofPagination: {
      rw: 'kuri',
      en: 'of',
      fr: 'sur'
    }[language],
    pageLabel: {
      rw: 'Ipaji',
      en: 'Page',
      fr: 'Page'
    }[language],
    prevPage: {
      rw: 'Ibyabanje',
      en: 'Previous',
      fr: 'Précédent'
    }[language],
    nextPage: {
      rw: 'Ibikurikira',
      en: 'Next',
      fr: 'Suivant'
    }[language]
  };

  const getLocalizedField = (field: any, defaultText = '—') => {
    if (!field) return defaultText;
    if (typeof field === 'string') return field;
    return field[language] || field['en'] || field['rw'] || field['fr'] || Object.values(field)[0] || defaultText;
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  useEffect(() => {
    async function fetchResults() {
      if (!userProfile && !firebaseUser) return;
      setLoading(true);
      try {
        // Try server-side enriched endpoint first
        const token = await firebaseUser?.getIdToken();
        if (token) {
          const res = await fetch('/api/exams/history', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.results)) {
              setResults(data.results);
              if (data.summary) {
                setSummary(data.summary);
              } else {
                // Compute summary locally
                computeLocalSummary(data.results);
              }
              if (Array.isArray(data.categoryMastery)) {
                setCategoryMastery(data.categoryMastery);
              }
              setLoading(false);
              return;
            }
          }
        }

        // Fallback to client Firestore subcollections
        const uid = userProfile?.uid || firebaseUser?.uid;
        if (uid) {
          const [resultsSnap, attemptsSnap] = await Promise.all([
            getDocs(query(collection(db, 'users', uid, 'examResults'))).catch(() => null),
            getDocs(query(collection(db, 'users', uid, 'examAttempts'))).catch(() => null)
          ]);

          const localList: ExamResultItem[] = [];
          if (resultsSnap && !resultsSnap.empty) {
            resultsSnap.docs.forEach(d => {
              const data = d.data();
              const score = Number(data.score) || 0;
              const total = Number(data.total) || 20;
              const passMark = Number(data.passMark) || 12;
              localList.push({
                id: d.id,
                attemptId: data.attemptId || d.id,
                date: data.submittedAt || data.date || new Date().toISOString(),
                durationSeconds: Number(data.durationSeconds) || 0,
                score,
                total,
                passMark,
                passed: data.passed !== undefined ? Boolean(data.passed) : score >= passMark,
                percentage: total > 0 ? Math.round((score / total) * 100) : 0,
                correctCount: score,
                incorrectCount: Math.max(0, total - score),
                questions: Array.isArray(data.results) ? data.results : []
              });
            });
          }

          if (attemptsSnap && !attemptsSnap.empty) {
            attemptsSnap.docs.forEach(d => {
              const data = d.data();
              if (data.status === 'finished' || data.status === 'completed' || data.score !== undefined) {
                if (!localList.some(e => e.id === d.id || e.attemptId === d.id)) {
                  const score = Number(data.score) || 0;
                  const total = Number(data.total) || 20;
                  const passMark = 12;
                  localList.push({
                    id: d.id,
                    attemptId: d.id,
                    date: data.submittedAt || (data.startedAt?.toDate ? data.startedAt.toDate().toISOString() : data.startedAt) || new Date().toISOString(),
                    durationSeconds: Number(data.durationSeconds) || 0,
                    score,
                    total,
                    passMark,
                    passed: data.passed !== undefined ? Boolean(data.passed) : score >= passMark,
                    percentage: total > 0 ? Math.round((score / total) * 100) : 0,
                    correctCount: score,
                    incorrectCount: Math.max(0, total - score),
                    questions: Array.isArray(data.results) ? data.results : []
                  });
                }
              }
            });
          }

          localList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setResults(localList);
          computeLocalSummary(localList);
        }
      } catch (err) {
        console.error("Error fetching results history:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchResults();
  }, [userProfile, firebaseUser]);

  const computeLocalSummary = (items: ExamResultItem[]) => {
    const totalExams = items.length;
    const passedExams = items.filter(e => e.passed).length;
    const failedExams = totalExams - passedExams;
    const passRate = totalExams > 0 ? Math.round((passedExams / totalExams) * 100) : 0;
    const totalScoreSum = items.reduce((acc, curr) => acc + curr.score, 0);
    const averageScore = totalExams > 0 ? Number((totalScoreSum / totalExams).toFixed(1)) : 0;
    const bestScore = totalExams > 0 ? Math.max(...items.map(e => e.score)) : 0;

    setSummary({
      totalExams,
      passedExams,
      failedExams,
      passRate,
      averageScore,
      bestScore
    });
  };

  const filteredResults = results.filter(r => {
    if (statusFilter === 'passed') return r.passed;
    if (statusFilter === 'failed') return !r.passed;
    return true;
  });

  const totalFiltered = filteredResults.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = totalFiltered === 0 ? 0 : (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalFiltered);
  const paginatedResults = filteredResults.slice(startIndex, endIndex);

  const handleFilterChange = (filter: 'all' | 'passed' | 'failed') => {
    setStatusFilter(filter);
    setCurrentPage(1);
  };

  // If user selected an exam to review, show dedicated full-page component view (optimized for phones & all screens)
  if (selectedExamToReview) {
    return (
      <ExamAttemptReviewView
        exam={selectedExamToReview}
        language={language}
        onBack={() => {
          setSelectedExamToReview(null);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Bar / Navigation */}
      <div className="flex items-center justify-between">
        <button 
          onClick={onBack} 
          className="min-h-[44px] flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> 
          <span>{t.backToDashboard}</span>
        </button>
      </div>

      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-7 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <Award className="w-6 h-6 text-blue-600 shrink-0" />
              <span>{t.pageTitle}</span>
            </h2>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
              {t.pageSubtitle}
            </p>
          </div>
          {results.length > 0 && (
            <div className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-medium text-slate-700 shrink-0 self-start sm:self-auto">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>{t.passMarkRequired}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Exam History Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
        {/* Table Header & Filter Bar */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-base text-slate-900">
              {language === 'rw' ? 'Urutonde rw\'Ibizamini Byakozwe' : language === 'fr' ? 'Historique des Tentatives' : 'Mock Exam Attempt History'}
            </h3>
            <span className="px-2 py-0.5 bg-slate-200/80 text-slate-700 text-xs font-semibold rounded-full font-mono">
              {results.length}
            </span>
          </div>

          {results.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
              <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-2xs">
                <button
                  onClick={() => handleFilterChange('all')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    statusFilter === 'all' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.filterAll} ({results.length})
                </button>
                <button
                  onClick={() => handleFilterChange('passed')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    statusFilter === 'passed' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-emerald-700 hover:text-emerald-900'
                  }`}
                >
                  {t.filterPassed} ({results.filter(r => r.passed).length})
                </button>
                <button
                  onClick={() => handleFilterChange('failed')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    statusFilter === 'failed' ? 'bg-red-600 text-white shadow-2xs' : 'text-red-700 hover:text-red-900'
                  }`}
                >
                  {t.filterFailed} ({results.filter(r => !r.passed).length})
                </button>
              </div>

              {/* Email-style Header Compact Pager (like Gmail) */}
              {totalFiltered > 0 && (
                <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs font-mono">
                  <span className="font-semibold text-slate-800">
                    {startIndex + 1}–{endIndex}
                  </span>
                  <span className="text-slate-400 font-sans">{t.ofPagination}</span>
                  <span className="font-semibold text-slate-800">{totalFiltered}</span>

                  <div className="flex items-center ml-1 border-l border-slate-200 pl-1 gap-0.5">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      title={t.prevPage}
                      className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                      aria-label={t.prevPage}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                      title={t.nextPage}
                      className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                      aria-label={t.nextPage}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Table Body / Loading / Empty States */}
        {loading ? (
          <div className="p-6 space-y-4">
            <div className="h-6 bg-slate-100 rounded w-48 mb-4 animate-pulse" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between py-4 border-b border-slate-100 animate-pulse">
                <div className="space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-36" />
                  <div className="h-3 bg-slate-100 rounded w-24" />
                </div>
                <div className="h-4 bg-slate-200 rounded w-20" />
                <div className="h-6 bg-slate-100 rounded-full w-20" />
              </div>
            ))}
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="p-10 sm:p-14 text-center space-y-3">
            <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
              <Award className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">{t.noExamsTitle}</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
              {results.length === 0 ? t.noExamsSubtitle : t.noQuestionsInFilter}
            </p>
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                    <th className="py-3.5 px-6">{t.colDate}</th>
                    <th className="py-3.5 px-6">{t.colScore}</th>
                    <th className="py-3.5 px-6">{t.colStatus}</th>
                    <th className="py-3.5 px-6">{t.colBreakdown}</th>
                    <th className="py-3.5 px-6">{t.colDuration}</th>
                    <th className="py-3.5 px-6 text-right">{t.colAction}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {paginatedResults.map((r, idx) => (
                    <tr key={r.id || idx} className="hover:bg-slate-50/70 transition-colors">
                      {/* Date */}
                      <td className="py-4 px-6 text-slate-600 text-xs">
                        <div className="flex items-center gap-2 font-medium text-slate-900">
                          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                          <span>{new Date(r.date || r.submittedAt || Date.now()).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono pl-6 mt-0.5">
                          {new Date(r.date || r.submittedAt || Date.now()).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                      </td>

                      {/* Score */}
                      <td className="py-4 px-6 whitespace-nowrap">
                        <div className="font-bold text-slate-900 text-base font-mono tabular-nums">
                          {r.score} <span className="text-xs text-slate-500 font-normal">/ {r.total}</span>
                        </div>
                        <div className="text-xs font-semibold text-blue-600">
                          {r.percentage}%
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-6 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                          r.passed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-red-50 text-red-700 border border-red-200/60'
                        }`}>
                          {r.passed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                          <span>{r.passed ? t.statusPassed : t.statusFailed}</span>
                        </span>
                      </td>

                      {/* Breakdown */}
                      <td className="py-4 px-6 whitespace-nowrap font-mono text-xs">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50/90 border border-emerald-200/50 px-2 py-0.5 rounded font-semibold">
                            <Check className="w-3 h-3" /> {r.correctCount ?? r.score}
                          </span>
                          <span className="inline-flex items-center gap-1 text-red-700 bg-red-50/90 border border-red-200/50 px-2 py-0.5 rounded font-semibold">
                            <X className="w-3 h-3" /> {r.incorrectCount ?? Math.max(0, r.total - r.score)}
                          </span>
                        </div>
                      </td>

                      {/* Duration */}
                      <td className="py-4 px-6 whitespace-nowrap text-slate-600 font-mono text-xs">
                        {formatDuration(r.durationSeconds)}
                      </td>

                      {/* Action Button */}
                      <td className="py-4 px-6 whitespace-nowrap text-right">
                        <button
                          onClick={() => {
                            setSelectedExamToReview(r);
                            setQuestionReviewFilter('all');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 active:bg-blue-200 rounded-lg text-xs font-semibold transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{t.inspectBtn}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Email-style Table Footer Pagination */}
            {totalFiltered > 0 && (
              <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="text-slate-600 font-medium">
                  {t.showingPagination} <span className="font-mono font-semibold text-slate-900">{startIndex + 1}–{endIndex}</span> {t.ofPagination} <span className="font-mono font-semibold text-slate-900">{totalFiltered}</span> {language === 'rw' ? 'ibizamini byakozwe' : language === 'fr' ? 'tentatives d\'examen' : 'mock exam attempts'}
                  <span className="text-slate-400 ml-1.5 hidden md:inline">
                    (5 {language === 'rw' ? 'kuri buri paji' : language === 'fr' ? 'par page' : 'per page'})
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <span className="text-slate-500 text-xs hidden sm:inline font-medium">
                    {t.pageLabel} <strong className="text-slate-800 font-mono">{safePage}</strong> {t.ofPagination} <strong className="text-slate-800 font-mono">{totalPages}</strong>
                  </span>

                  <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      title={t.prevPage}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span className="hidden sm:inline">{t.prevPage}</span>
                    </button>

                    {/* Numeric page pills if totalPages > 1 */}
                    {totalPages > 1 && (
                      <div className="flex items-center px-1 border-x border-slate-100 gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                          .map((pageNum, idx, arr) => {
                            const prevPageNum = arr[idx - 1];
                            const showEllipsis = prevPageNum && pageNum - prevPageNum > 1;
                            return (
                              <React.Fragment key={pageNum}>
                                {showEllipsis && <span className="px-1 text-slate-300">…</span>}
                                <button
                                  onClick={() => setCurrentPage(pageNum)}
                                  className={`w-7 h-7 flex items-center justify-center rounded-md font-mono text-xs font-semibold transition-colors ${
                                    safePage === pageNum
                                      ? 'bg-slate-900 text-white shadow-2xs'
                                      : 'text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  {pageNum}
                                </button>
                              </React.Fragment>
                            );
                          })}
                      </div>
                    )}

                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                      title={t.nextPage}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                    >
                      <span className="hidden sm:inline">{t.nextPage}</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

