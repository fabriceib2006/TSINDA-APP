import React, { useState } from 'react';
import { Language } from '../../types';
import {
  ArrowLeft,
  ArrowUp,
  Award,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Check,
  X,
  HelpCircle,
  Lightbulb,
  ShieldCheck,
  AlertCircle,
  BookOpen,
  Filter
} from 'lucide-react';

export interface QuestionReviewItem {
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

export interface ExamCategoryStat {
  categoryId: string;
  categoryName: any;
  total: number;
  correct: number;
  accuracy: number;
}

export interface ExamResultItem {
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

interface ExamAttemptReviewViewProps {
  exam: ExamResultItem;
  language: Language;
  onBack: () => void;
}

export const ExamAttemptReviewView: React.FC<ExamAttemptReviewViewProps> = ({
  exam,
  language,
  onBack
}) => {
  const [filter, setFilter] = useState<'all' | 'wrong' | 'correct'>('all');

  // Translations
  const t = {
    backToHistory: {
      rw: "Gusubira ku Mateka y'Ibizamini",
      en: 'Back to Exam History',
      fr: "Retour à l'Historique des Examens"
    }[language],
    pageTitle: {
      rw: "Isesengura Ryimbitse ry'Ikizamini",
      en: 'In-Depth Exam Analysis',
      fr: 'Analyse Détaillée de la Tentative'
    }[language],
    pageSubtitle: {
      rw: "Reba ibisubizo byose, amakosa wakoze n'ibisobanuro by'amategeko y'umuhanda.",
      en: 'Inspect all questions, your submitted answers, and official traffic code explanations.',
      fr: 'Examinez toutes les questions, vos réponses soumises et les explications officielles du code de la route.'
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
    scoreLabel: {
      rw: 'Amanota Yabonetse',
      en: 'Final Score',
      fr: 'Score Obtenu'
    }[language],
    passMarkRequired: {
      rw: 'Amanota asabwa gutsinda: 12 / 20 (60%)',
      en: 'Pass requirement: 12 / 20 (60%)',
      fr: 'Exigence de réussite: 12 / 20 (60%)'
    }[language],
    timeTaken: {
      rw: 'Igihe Byatwaye',
      en: 'Time Taken',
      fr: 'Temps Écoulé'
    }[language],
    dateTaken: {
      rw: 'Itariki Yakozweho',
      en: 'Exam Date',
      fr: "Date de l'Examen"
    }[language],
    correctCount: {
      rw: 'Ibyakozwe Neza',
      en: 'Correct Answers',
      fr: 'Bonnes Réponses'
    }[language],
    mistakesCount: {
      rw: 'Amakosa',
      en: 'Mistakes',
      fr: 'Erreurs'
    }[language],
    topicBreakdownTitle: {
      rw: "Imitsindire ku Ngingo z'Amategeko",
      en: 'Performance by Topic & Category',
      fr: 'Performance par Thème et Catégorie'
    }[language],
    tabAll: {
      rw: 'Ibibazo Byose',
      en: 'All Questions',
      fr: 'Toutes les Questions'
    }[language],
    tabMistakes: {
      rw: 'Amakosa Gusa',
      en: 'Mistakes Only',
      fr: 'Erreurs Seulement'
    }[language],
    tabCorrect: {
      rw: 'Ibyakozwe Neza',
      en: 'Correct Only',
      fr: 'Correctes Seulement'
    }[language],
    questionLabel: {
      rw: 'Ikibazo',
      en: 'Question',
      fr: 'Question'
    }[language],
    correctAnswerBadge: {
      rw: 'Igisubizo Nyacyo',
      en: 'Correct Answer',
      fr: 'Bonne Réponse'
    }[language],
    yourChoiceBadge: {
      rw: 'Icyo Wahisemo',
      en: 'Your Choice',
      fr: 'Votre Choix'
    }[language],
    yourCorrectChoiceBadge: {
      rw: 'Wahisemo Neza',
      en: 'Your Choice · Correct',
      fr: 'Votre Choix · Correct'
    }[language],
    explanationLabel: {
      rw: "Ibisobanuro Nyakuri n'Itegeko",
      en: 'Official Traffic Explanation',
      fr: 'Explication et Règle Officielle'
    }[language],
    scrollToTop: {
      rw: 'Kuzamuka Hejuru',
      en: 'Scroll to Top',
      fr: 'Haut de Page'
    }[language],
    noLegacyDetails: {
      rw: "Ibisobanuro birambuye by'ibibazo by'iki kizamini cyo hambere ntibirimo. Ibizamini bishya byose byandikwa mu buryo burambuye.",
      en: 'Detailed question breakdowns are not available for this legacy attempt. All recent and new attempts record full question details.',
      fr: "Le détail complet des questions pour cette ancienne tentative n'est pas disponible. Toutes les nouvelles tentatives sont enregistrées avec le détail complet."
    }[language],
    noFilterMatch: {
      rw: 'Nta bibazo biboneka muri iki cyiciro wahisemo.',
      en: 'No questions match this filter.',
      fr: 'Aucune question ne correspond à ce filtre.'
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

  const questions = exam.questions || [];
  const filteredQuestions = questions.filter(q => {
    if (filter === 'correct') return q.isCorrect;
    if (filter === 'wrong') return !q.isCorrect;
    return true;
  });

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16 px-1 sm:px-0 animate-in fade-in duration-200">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200/90 text-sm font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 shadow-2xs transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-blue-600" />
          <span>{t.backToHistory}</span>
        </button>

        <span className="text-xs font-medium text-slate-500 hidden sm:inline-flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>{t.passMarkRequired}</span>
        </span>
      </div>

      {/* Main Hero Header Card */}
      <div className={`p-5 sm:p-7 rounded-2xl border shadow-sm transition-all ${
        exam.passed 
          ? 'bg-gradient-to-br from-emerald-50/70 via-white to-white border-emerald-200/80' 
          : 'bg-gradient-to-br from-red-50/70 via-white to-white border-red-200/80'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          {/* Status & Title */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase shadow-2xs ${
                exam.passed 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-red-600 text-white'
              }`}>
                {exam.passed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                {exam.passed ? t.statusPassed : t.statusFailed}
              </span>

              <span className="text-xs text-slate-500 font-medium">
                {new Date(exam.date || exam.submittedAt || Date.now()).toLocaleDateString(undefined, { 
                  weekday: 'short', 
                  year: 'numeric', 
                  month: 'short', 
                  day: 'numeric' 
                })}
              </span>

              <span className="text-slate-300 hidden sm:inline">·</span>

              <span className="text-xs font-mono text-slate-400">
                {new Date(exam.date || exam.submittedAt || Date.now()).toLocaleTimeString(undefined, { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {t.pageTitle}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
              {t.pageSubtitle}
            </p>
          </div>

          {/* Score Badge Card */}
          <div className="bg-white/90 backdrop-blur-xs p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs shrink-0 flex items-center justify-between md:justify-center gap-6">
            <div className="text-left md:text-right">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                {t.scoreLabel}
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className={`text-3xl sm:text-4xl font-black font-mono tracking-tight ${
                  exam.passed ? 'text-emerald-600' : 'text-red-600'
                }`}>
                  {exam.score}
                </span>
                <span className="text-base font-semibold text-slate-400">/ {exam.total}</span>
              </div>
            </div>

            <div className="h-12 w-px bg-slate-200 hidden md:block" />

            <div className="text-right">
              <span className={`text-xl sm:text-2xl font-bold font-mono block ${
                exam.percentage >= 60 ? 'text-emerald-700' : 'text-red-700'
              }`}>
                {exam.percentage}%
              </span>
              <span className="text-[11px] font-medium text-slate-500 block">
                {exam.passed ? '≥ 60% Required' : '< 60% Required'}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Metrics Bar */}
        <div className="mt-6 pt-5 border-t border-slate-200/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-white rounded-xl border border-slate-200/80">
            <span className="text-slate-500 block text-[11px] font-medium">{t.timeTaken}</span>
            <div className="flex items-center gap-1.5 mt-1 font-bold text-slate-800">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{formatDuration(exam.durationSeconds)}</span>
            </div>
          </div>

          <div className="p-3 bg-white rounded-xl border border-slate-200/80">
            <span className="text-slate-500 block text-[11px] font-medium">{t.correctCount}</span>
            <div className="flex items-center gap-1.5 mt-1 font-bold text-emerald-700 font-mono">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{exam.correctCount} / {exam.total}</span>
            </div>
          </div>

          <div className="p-3 bg-white rounded-xl border border-slate-200/80">
            <span className="text-slate-500 block text-[11px] font-medium">{t.mistakesCount}</span>
            <div className="flex items-center gap-1.5 mt-1 font-bold text-red-700 font-mono">
              <XCircle className="w-3.5 h-3.5 text-red-600" />
              <span>{exam.incorrectCount} / {exam.total}</span>
            </div>
          </div>

          <div className="p-3 bg-white rounded-xl border border-slate-200/80">
            <span className="text-slate-500 block text-[11px] font-medium">{t.passMarkRequired}</span>
            <div className="flex items-center gap-1.5 mt-1 font-semibold text-slate-700 text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>12 / 20 (60%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs Strip */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2 sm:p-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 sm:flex-initial min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              filter === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {t.tabAll} ({questions.length || exam.total})
          </button>

          <button
            onClick={() => setFilter('wrong')}
            className={`flex-1 sm:flex-initial min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              filter === 'wrong'
                ? 'bg-red-600 text-white shadow-2xs'
                : 'text-red-700 bg-red-50/60 hover:bg-red-100/70'
            }`}
          >
            {t.tabMistakes} ({exam.incorrectCount})
          </button>

          <button
            onClick={() => setFilter('correct')}
            className={`flex-1 sm:flex-initial min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              filter === 'correct'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-emerald-700 bg-emerald-50/60 hover:bg-emerald-100/70'
            }`}
          >
            {t.tabCorrect} ({exam.correctCount})
          </button>
        </div>

        <div className="text-xs text-slate-500 font-medium px-2 py-1 hidden sm:block">
          {language === 'rw' 
            ? `Kwerekana ibibazo ${filteredQuestions.length} muri ${questions.length}`
            : `Showing ${filteredQuestions.length} of ${questions.length} questions`}
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-4">
        {questions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center text-slate-500 space-y-3">
            <HelpCircle className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">
              {language === 'rw' ? "Nta makuru arambuye y'ibibazo ahari" : "Detailed Questions Unavailable"}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
              {t.noLegacyDetails}
            </p>
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="text-sm font-medium text-slate-700">{t.noFilterMatch}</p>
          </div>
        ) : (
          filteredQuestions.map((q, qIndex) => {
            const localizedQText = getLocalizedField(q.text, `${t.questionLabel} ${q.index}`);
            const optionsList: string[] = Array.isArray(q.options)
              ? q.options
              : (q.options?.[language] || q.options?.rw || q.options?.en || q.options?.fr || []);
            const localizedExplanation = getLocalizedField(q.explanation, '');

            return (
              <div
                key={q.questionId || qIndex}
                className={`bg-white rounded-2xl border shadow-sm p-4 sm:p-6 space-y-4 transition-all ${
                  q.isCorrect ? 'border-slate-200 hover:border-emerald-200' : 'border-red-200/90 hover:border-red-300'
                }`}
              >
                {/* Question Header */}
                <div className="flex flex-wrap items-start justify-between gap-2.5 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-7 h-7 rounded-lg bg-slate-900 text-white font-mono text-xs font-bold flex items-center justify-center shrink-0">
                      #{q.index}
                    </span>

                    {q.category && (
                      <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
                        {getLocalizedField(q.categoryName, q.category)}
                      </span>
                    )}
                  </div>

                  <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${
                    q.isCorrect 
                      ? 'bg-emerald-100 text-emerald-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {q.isCorrect ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>{language === 'rw' ? 'Byakozwe Neza' : language === 'fr' ? 'Correct' : 'Correct'}</span>
                      </>
                    ) : (
                      <>
                        <X className="w-3.5 h-3.5" />
                        <span>{language === 'rw' ? 'Ikosa ryakozwe' : language === 'fr' ? 'Erreur' : 'Incorrect'}</span>
                      </>
                    )}
                  </span>
                </div>

                {/* Question Text */}
                <div className="space-y-3">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                    {localizedQText}
                  </h3>

                  {/* Optional Road Sign / Traffic Image */}
                  {q.imageUrl && (
                    <div className="w-full max-w-lg bg-slate-50/90 border border-slate-200/90 rounded-2xl p-4 sm:p-6 flex justify-center shadow-xs mx-auto">
                      <img
                        src={q.imageUrl}
                        alt="Road visual reference"
                        className="max-h-72 sm:max-h-96 w-auto object-contain rounded-xl"
                        loading="lazy"
                      />
                    </div>
                  )}
                </div>

                {/* Options List */}
                <div className="space-y-2.5 pt-1">
                  {optionsList.map((optText, optIdx) => {
                    const isCorrectOpt = optIdx === q.correctIndex;
                    const isUserChosen = optIdx === q.userAnswer;

                    let cardClasses = 'border-slate-200 bg-white text-slate-700 hover:border-slate-300';
                    let letterClasses = 'border-slate-300 text-slate-600 bg-slate-50';

                    if (isCorrectOpt) {
                      cardClasses = 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-medium ring-1 ring-emerald-500/30';
                      letterClasses = 'border-emerald-600 bg-emerald-600 text-white';
                    } else if (isUserChosen && !isCorrectOpt) {
                      cardClasses = 'border-red-400 bg-red-50/70 text-red-950 font-medium ring-1 ring-red-400/30';
                      letterClasses = 'border-red-600 bg-red-600 text-white';
                    }

                    return (
                      <div
                        key={optIdx}
                        className={`p-3.5 rounded-xl border text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${cardClasses}`}
                      >
                        <div className="flex items-start sm:items-center gap-3">
                          <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono text-xs font-bold border shrink-0 transition-colors ${letterClasses}`}>
                            {String.fromCharCode(65 + optIdx)}
                          </span>
                          <span className="leading-snug">{optText}</span>
                        </div>

                        {/* Status Tags */}
                        <div className="flex items-center gap-1.5 shrink-0 pl-9 sm:pl-0 text-xs font-semibold">
                          {isCorrectOpt && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                              <Check className="w-3.5 h-3.5" />
                              <span>{t.correctAnswerBadge}</span>
                            </span>
                          )}

                          {isUserChosen && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                              isCorrectOpt 
                                ? 'bg-emerald-200/80 text-emerald-900' 
                                : 'bg-red-200/80 text-red-900'
                            }`}>
                              {isCorrectOpt ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>{t.yourCorrectChoiceBadge}</span>
                                </>
                              ) : (
                                <>
                                  <X className="w-3.5 h-3.5" />
                                  <span>{t.yourChoiceBadge}</span>
                                </>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Explanation Card */}
                {localizedExplanation && (
                  <div className="mt-3 p-4 sm:p-4.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs sm:text-sm text-blue-950 space-y-1.5 shadow-2xs">
                    <div className="font-bold flex items-center gap-1.5 text-blue-900">
                      <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>{t.explanationLabel}:</span>
                    </div>
                    <p className="text-slate-700 leading-relaxed font-normal pl-5">
                      {localizedExplanation}
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Floating/Fixed Action Bar */}
      <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200">
        <button
          onClick={onBack}
          className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t.backToHistory}</span>
        </button>

        <button
          onClick={scrollToTop}
          className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors"
        >
          <ArrowUp className="w-4 h-4" />
          <span>{t.scrollToTop}</span>
        </button>
      </div>
    </div>
  );
};
