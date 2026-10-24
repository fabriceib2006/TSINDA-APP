import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Question, ExamSettings, Language, CombinedAccess, Subscription } from '../../types';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { normalizeSubscription, getCombinedAccess } from '../../lib/subscriptionUtils';
import { 
  Clock, 
  ArrowLeft, 
  Award, 
  Lock, 
  CheckCircle2, 
  XCircle, 
  Play,
  AlertCircle,
  RefreshCw,
  Check,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { SubscriptionModal } from './SubscriptionModal';
import { getLocalizedQuestionText, getLocalizedQuestionOptions, getLocalizedQuestionExplanation, NotTranslatedBadge } from '../../lib/i18n';

export interface ServerExamResult {
  score: number;
  passed: boolean;
  total: number;
  passMark: number;
  results: {
    questionId: string;
    userAnswer: number;
    correctIndex: number;
    explanation: Record<Language, string>;
    isCorrect: boolean;
  }[];
}

export const MockExamView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { userProfile, firebaseUser, getIdToken } = useAuth();
  const { language } = useLanguage();
  const getToken = async () => {
    if (typeof getIdToken === 'function') return await getIdToken();
    return firebaseUser && typeof firebaseUser.getIdToken === 'function' ? await firebaseUser.getIdToken() : '';
  };
  
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  const [settings, setSettings] = useState<ExamSettings>({ id: 'global', numQuestions: 20, durationMinutes: 20, passMark: 12 });
  const [access, setAccess] = useState<CombinedAccess | null>(null);
  
  const [examState, setExamState] = useState<'ready' | 'running' | 'submitted'>('ready');
  const [currentAttemptId, setCurrentAttemptId] = useState<string | null>(null);
  const [serverResult, setServerResult] = useState<ServerExamResult | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<'NO_PLAN' | 'NO_CREDITS' | null>(null);
  const [isResumed, setIsResumed] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'correct' | 'wrong'>('all');
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleRetryWrong = async () => {
    if (!serverResult) return;
    const wrongQuestionIds = serverResult.results.filter(r => !r.isCorrect).map(r => r.questionId);
    if (wrongQuestionIds.length === 0) return;
    
    // Simplification: In a real app, this would require a specific API call. 
    // For now, inform the user or implement a basic retry mechanism.
    alert(`Retry functionality would start a new exam with ${wrongQuestionIds.length} wrong questions.`);
  };

  useEffect(() => {
    let timer: any = null;
    if (examState === 'running' && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            handleSubmitExam();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [examState, timeLeft]);

  const initData = async () => {
    if (!userProfile) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const token = await getToken();
      const settingsRes = await fetch('/api/exams/settings', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!settingsRes.ok) throw new Error('Failed to fetch exam settings');
      const settingsData = await settingsRes.json();
      setSettings(settingsData);
      
      const [subsSnap, purchasesSnap, accessSnap] = await Promise.all([
        getDocs(query(collection(db, 'subscriptions'), where('userId', '==', userProfile.uid))).catch(() => null),
        getDocs(query(collection(db, 'users', userProfile.uid, 'purchases'), where('status', '==', 'active'))).catch(() => null),
        getDocs(collection(db, 'users', userProfile.uid, 'access')).catch(() => null),
      ]);

      const allList: Subscription[] = [];
      if (purchasesSnap) {
        purchasesSnap.docs.forEach(d => allList.push(normalizeSubscription(d.data(), d.id)));
      }
      if (subsSnap) {
        subsSnap.docs.forEach(d => {
          if (!allList.some(p => p.id === d.id || p.planId === d.data().planId)) {
            allList.push(normalizeSubscription(d.data(), d.id));
          }
        });
      }

      const combined = getCombinedAccess(allList);
      const currentDoc = accessSnap?.docs.find(d => d.id === 'current');
      if (currentDoc) {
        const cData = currentDoc.data();
        if (cData.planName) combined.activePlanName = cData.planName;
        if (typeof cData.examCredits === 'number') {
          combined.examsRemaining = cData.examCredits;
          combined.isUnlimitedExams = false;
        } else if (cData.examCredits === null && combined.exams) {
          combined.isUnlimitedExams = true;
          combined.examsRemaining = null;
        }
      }

      setAccess(combined);
    } catch (err: any) {
      console.error("Error initializing exam view:", err);
      setErrorMsg(err.message || 'Failed to initialize exam');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { initData(); }, [userProfile]);

  const handleStartExam = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/exams/start', { 
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.code === 'NO_PLAN' || errData.code === 'NO_CREDITS') {
          setErrorCode(errData.code);
        }
        throw new Error(errData.error || 'Failed to start exam');
      }
      const data = await res.json();
      setExamQuestions(data.questions);
      setCurrentAttemptId(data.attemptId);
      
      const expiresAt = new Date(data.expiresAt).getTime();
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      
      // Check if it was an existing attempt
      // If remaining time is less than total duration, consider it resumed
      const totalSecs = (settings.durationMinutes || 20) * 60;
      if (remaining < totalSecs - 5) {
        setIsResumed(true);
      }

      setExamState('running');
    } catch (err: any) {
      console.error("Error starting exam:", err);
      setErrorMsg(err.message || 'Failed to start exam');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitExam = async () => {
    if (!currentAttemptId) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/exams/submit', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: currentAttemptId, answers: userAnswers })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to submit exam');
      }
      const data = await res.json();
      setServerResult({
        score: data.score,
        passed: data.passed,
        total: data.total,
        passMark: settings.passMark || 12,
        results: data.results
      });
      setExamState('submitted');
    } catch (err: any) {
      console.error("Error submitting exam:", err);
      setErrorMsg(err.message || 'Failed to submit exam');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (loading && examState === 'ready') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (errorCode || (!loading && access && (!access.exams || (!access.isUnlimitedExams && access.examsRemaining === 0)))) {
    const isNoCredits = errorCode === 'NO_CREDITS' || (access && access.exams && !access.isUnlimitedExams && access.examsRemaining === 0);
    return (
      <div className="max-w-md mx-auto bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-6 shadow-sm my-12">
        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-slate-900">
            {isNoCredits
              ? (language === 'rw' ? 'Ibizamini Byashize (No Credits)' : language === 'fr' ? 'Crédits Épuisés' : 'No Exam Credits Remaining')
              : (language === 'rw' ? 'Nta Gahunda Ifunguye (No Plan)' : language === 'fr' ? 'Aucun Forfait Actif' : 'No Active Plan')}
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            {isNoCredits
              ? (language === 'rw'
                  ? 'Wakoresheje ibizamini byose wari wemerewe muri gahunda yawe. Nyamuneka gura indi gahunda cyangwa ibizamini byo gukomeza.'
                  : language === 'fr'
                  ? 'Vous avez utilisé tous vos crédits d\'examen. Veuillez mettre à niveau votre forfait ou acheter un pack d\'examens.'
                  : 'You have used all exam credits on your current plan. Please upgrade your plan or purchase an exam pack to continue.')
              : (language === 'rw'
                  ? 'Nta gahunda y\'ifite ifunguye irimo ibizamini byo kwimenyereza. Nyamuneka hitamo gahunda kugira ngo utangire kwitoza.'
                  : language === 'fr'
                  ? 'Vous n\'avez pas de forfait actif incluant les examens blancs. Veuillez choisir un forfait pour commencer à vous entraîner.'
                  : 'You do not hold an active plan that allows exams. Please subscribe to a study plan or exam pack to start practicing.')}
          </p>
        </div>
        <div className="space-y-3">
          <button
            onClick={() => setIsSubModalOpen(true)}
            className="w-full min-h-[48px] px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md transition-colors text-sm flex items-center justify-center gap-2"
          >
            <span>{language === 'rw' ? 'Gura / Hindura Gahunda' : language === 'fr' ? 'Mettre à niveau' : 'Upgrade Plan'}</span>
          </button>
          <button
            onClick={onBack}
            className="w-full min-h-[48px] px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors text-sm"
          >
            {language === 'rw' ? 'Subira kuri Dashboard' : language === 'fr' ? 'Retour au tableau de bord' : 'Back to Dashboard'}
          </button>
        </div>
        <SubscriptionModal
          isOpen={isSubModalOpen}
          onClose={() => { setIsSubModalOpen(false); setErrorCode(null); initData(); }}
          onSubscribed={() => { setIsSubModalOpen(false); setErrorCode(null); initData(); }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{language === 'rw' ? 'Subira kuri Dashboard' : language === 'fr' ? 'Retour au tableau de bord' : 'Back to Dashboard'}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div className="text-sm font-medium">{errorMsg}</div>
          </div>
          {(errorMsg.toLowerCase().includes('plan') || errorMsg.toLowerCase().includes('credit') || errorMsg.toLowerCase().includes('expired')) && (
            <button
              onClick={() => setIsSubModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs shrink-0 transition-colors shadow-sm"
            >
              {language === 'rw' ? 'Hindura Porogaramu' : language === 'fr' ? 'Changer de forfait' : 'Upgrade Plan'}
            </button>
          )}
        </div>
      )}

      {/* READY STATE */}
      {examState === 'ready' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 sm:p-10 space-y-8">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0">
              <Award className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900">
                {language === 'rw' ? 'Igitabo cy\'Iizamini ry\'Imenyekerezo' : language === 'fr' ? 'Examen Blanc National' : 'National Mock Exam'}
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                {language === 'rw' 
                  ? 'Iizamini ryegereje ryateguwe nk\'irya nyirizina rya Polisi y\'u Rwanda (RNP).'
                  : language === 'fr'
                  ? 'Simulation officielle d\'examen théorique du code de la route rwandais.'
                  : 'Official simulation modeled after the Rwanda National Police driving theory exam.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-1">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {language === 'rw' ? 'Ibibazo' : language === 'fr' ? 'Questions' : 'Questions'}
              </div>
              <div className="text-xl font-bold text-slate-900">{settings.numQuestions}</div>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-1">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {language === 'rw' ? 'Igihe' : language === 'fr' ? 'Durée' : 'Duration'}
              </div>
              <div className="text-xl font-bold text-slate-900">{settings.durationMinutes} {language === 'rw' ? 'iminota' : language === 'fr' ? 'minutes' : 'minutes'}</div>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-1">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {language === 'rw' ? 'Amanota yo gutsinda' : language === 'fr' ? 'Note de passage' : 'Passing Score'}
              </div>
              <div className="text-xl font-bold text-slate-900">{settings.passMark} / {settings.numQuestions}</div>
            </div>
          </div>

          <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-blue-900">
              {language === 'rw' ? 'Amategeko y\'Iizamini' : language === 'fr' ? 'Règles de l\'examen' : 'Exam Rules & Instructions'}
            </h3>
            <ul className="text-xs text-blue-800 space-y-1.5 list-disc list-inside">
              <li>{language === 'rw' ? 'Ntugomba gusohoka mu isiramu y\'iizamini.' : language === 'fr' ? 'Ne quittez pas la page de l\'examen.' : 'Do not refresh or leave the page during the exam.'}</li>
              <li>{language === 'rw' ? 'Iyo igihe kirangiye, iizamini ryoherezwa ryonyine.' : language === 'fr' ? 'Le temps écoulé soumettra automatiquement l\'examen.' : 'Unsubmitted answers are automatically scored when the timer expires.'}</li>
              <li>{language === 'rw' ? 'Ushobora gusubira inyuma ugahindura ibisubizo.' : language === 'fr' ? 'Vous pouvez naviguer entre les questions.' : 'You can navigate back and forth between questions before submitting.'}</li>
            </ul>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleStartExam}
              disabled={loading}
              className="min-h-[48px] px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>{language === 'rw' ? 'Tangira Iizamini' : language === 'fr' ? 'Commencer l\'Examen' : 'Start Exam'}</span>
            </button>
          </div>
        </div>
      )}

      {/* RUNNING STATE */}
      {examState === 'running' && examQuestions.length > 0 && (
        <div className="space-y-6">
          {/* Header Progress & Timer */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-700">
                {language === 'rw' ? 'Ikibazo' : language === 'fr' ? 'Question' : 'Question'} {currentIndex + 1} / {examQuestions.length}
              </span>
              {isResumed && (
                <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                  {language === 'rw' ? 'Byongeye Gukomeza (Resumed)' : language === 'fr' ? 'Repris' : 'Attempt Resumed'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-xl text-slate-800 font-mono font-bold text-sm">
              <Clock className="w-4 h-4 text-blue-600 animate-pulse" />
              <span>{formatTime(timeLeft)}</span>
            </div>
          </div>

          {/* Question Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-sm space-y-6">
            <div className="space-y-3">
              <div className="inline-block text-[11px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">
                {examQuestions[currentIndex].category}
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-relaxed flex items-center flex-wrap gap-2">
                <span>{getLocalizedQuestionText(examQuestions[currentIndex], language).text}</span>
                {getLocalizedQuestionText(examQuestions[currentIndex], language).isFallback && <NotTranslatedBadge />}
              </h2>
              {Array.isArray(examQuestions[currentIndex].images) && examQuestions[currentIndex].images.length > 0 ? (
                <div className="flex flex-wrap gap-3 pt-2">
                  {examQuestions[currentIndex].images.map((imgUrl, i) => (
                    <img
                      key={`q-img-${currentIndex}-${i}`}
                      src={imgUrl}
                      alt={`Question illustration ${i+1}`}
                      onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                      className="max-h-48 rounded-xl border border-slate-200 bg-slate-50 object-contain shadow-xs"
                    />
                  ))}
                </div>
              ) : examQuestions[currentIndex].imageUrl ? (
                <div className="pt-2">
                  <img
                    src={examQuestions[currentIndex].imageUrl}
                    alt="Question illustration"
                    onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                    className="max-h-48 rounded-xl border border-slate-200 bg-slate-50 object-contain shadow-xs"
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-3 pt-2">
              {getLocalizedQuestionOptions(examQuestions[currentIndex], language).options.map((opt, idx) => {
                const isSelected = userAnswers[examQuestions[currentIndex].id] === idx;
                const optLetter = ['a', 'b', 'c', 'd'][idx];
                const optImg = (examQuestions[currentIndex] as any).optionImages?.[optLetter];
                return (
                  <button
                    key={`${examQuestions[currentIndex].id}-${idx}`}
                    onClick={() => setUserAnswers({ ...userAnswers, [examQuestions[currentIndex].id]: idx })}
                    className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3.5 ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-semibold ring-2 ring-blue-600/20'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 text-xs font-bold mt-0.5 ${
                      isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 text-slate-500'
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </div>
                    <div className="flex-1 space-y-1">
                      {opt && <span className="text-sm sm:text-base leading-normal block">{opt}</span>}
                      {optImg && (
                        <img
                          src={optImg}
                          alt={`Option ${String.fromCharCode(65 + idx)} illustration`}
                          onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                          className="max-h-24 rounded-lg border bg-slate-50 object-contain mt-1"
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Navigation footer */}
            <div className="flex items-center justify-between pt-6 border-t border-slate-100">
              <button
                onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 disabled:opacity-40 transition-colors flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{language === 'rw' ? 'Ibanze' : language === 'fr' ? 'Précédent' : 'Previous'}</span>
              </button>

              {currentIndex < examQuestions.length - 1 ? (
                <button
                  onClick={() => setCurrentIndex(prev => Math.min(examQuestions.length - 1, prev + 1))}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors flex items-center gap-2"
                >
                  <span>{language === 'rw' ? 'Ibikurikira' : language === 'fr' ? 'Suivant' : 'Next'}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleSubmitExam}
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-colors flex items-center gap-2"
                >
                  <span>{language === 'rw' ? 'Ohereza Iizamini' : language === 'fr' ? 'Soumettre' : 'Submit Exam'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUBMITTED / RESULTS STATE */}
      {examState === 'submitted' && serverResult && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 sm:p-10 space-y-8">
          <div className="text-center space-y-3">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto shadow-sm ${
              serverResult.passed ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
            }`}>
              {serverResult.passed ? <CheckCircle2 className="w-10 h-10" /> : <XCircle className="w-10 h-10" />}
            </div>

            <h2 className="text-2xl font-extrabold text-slate-900">
              {serverResult.passed 
                ? (language === 'rw' ? 'Watsinze Iizamini!' : language === 'fr' ? 'Examen réussi !' : 'Exam Passed!')
                : (language === 'rw' ? 'Ntibashije Gutsinda' : language === 'fr' ? 'Examen échoué' : 'Exam Not Passed')}
            </h2>

            <p className="text-sm text-slate-600 max-w-md mx-auto">
              {language === 'rw' ? 'Amanota yawe y\'ingenzi hamwe n\'isesurwa ry\'ibisubizo:' : language === 'fr' ? 'Vos résultats détaillés :' : 'Here is your detailed performance breakdown:'}
            </p>

            <div className="inline-flex items-center gap-6 bg-slate-50 border border-slate-100 px-6 py-3 rounded-2xl text-slate-800 font-bold">
              <div>
                <span className="text-xs text-slate-500 block">{language === 'rw' ? 'Amanota' : language === 'fr' ? 'Score' : 'Score'}</span>
                <span className="text-xl text-blue-600">{serverResult.score} / {serverResult.total}</span>
              </div>
              <div className="w-px h-8 bg-slate-200"></div>
              <div>
                <span className="text-xs text-slate-500 block">{language === 'rw' ? 'Bisabwa' : language === 'fr' ? 'Requis' : 'Required'}</span>
                <span className="text-xl text-slate-800">{serverResult.passMark}</span>
              </div>
            </div>
          </div>

          <div className="space-y-6 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h3 className="font-bold text-slate-900 text-lg">
                {language === 'rw' ? 'Isesurwa ry\'Ibibazo' : language === 'fr' ? 'Révision des questions' : 'Question Review'}
              </h3>
              <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                {(['all', 'correct', 'wrong'] as const).map(f => (
                  <button key={f} onClick={() => setReviewFilter(f)} className={`px-3 py-1.5 rounded-md text-xs font-bold capitalize ${reviewFilter === f ? 'bg-white shadow-xs text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {serverResult.results.filter(r => reviewFilter === 'all' || (reviewFilter === 'correct' ? r.isCorrect : !r.isCorrect)).map((r, i) => {
                const q = examQuestions.find(item => item.id === r.questionId);
                if (!q) return null;
                const explData = getLocalizedQuestionExplanation(q, language);
                const optData = getLocalizedQuestionOptions(q, language);

                return (
                  <div key={`${r.questionId}-${i}`} className={`p-5 rounded-2xl border ${r.isCorrect ? 'border-emerald-200 bg-emerald-50/30' : 'border-rose-200 bg-rose-50/30'} space-y-4`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-bold text-slate-900 text-sm flex gap-2">
                        <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs shrink-0">{i + 1}</span>
                        <span className="leading-relaxed">{getLocalizedQuestionText(q, language).text}</span>
                      </div>
                    </div>
                    {/* Question Images */}
                    {Array.isArray(q.images) && q.images.length > 0 && (
                      <div className="flex flex-wrap gap-2 pl-8">
                        {q.images.map((imgUrl, i) => <img key={i} src={imgUrl} alt="" className="max-h-36 rounded-lg border bg-slate-50 object-contain p-1" />)}
                      </div>
                    )}
                    {/* Options */}
                    <div className="grid grid-cols-1 gap-2 pl-8">
                      {optData.options.map((opt, idx) => {
                        const isCorrect = idx === r.correctIndex;
                        const isUserAnswer = idx === r.userAnswer;
                        const optLetter = ['a', 'b', 'c', 'd'][idx];
                        const optImg = (q as any).optionImages?.[optLetter];
                        
                        return (
                          <div key={`${r.questionId}-${idx}`} className={`p-3 rounded-lg border ${isCorrect ? 'border-emerald-500 bg-emerald-50' : isUserAnswer ? 'border-rose-500 bg-rose-50' : 'border-slate-200 bg-white'}`}>
                            <div className="flex items-start gap-3">
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${isCorrect ? 'bg-emerald-500 text-white' : isUserAnswer ? 'bg-rose-500 text-white' : 'border border-slate-300 text-slate-500'}`}>
                                {String.fromCharCode(65 + idx)}
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
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="flex justify-end pt-4 gap-3">
            <button onClick={handleRetryWrong} className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm transition-colors">
              {language === 'rw' ? 'Subiramo Ibibazo Byanze' : language === 'fr' ? 'Réessayer les questions erronées' : 'Retry wrong questions'}
            </button>
            <button onClick={onBack} className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm transition-colors">
              {language === 'rw' ? 'Subira ku Itangiriro' : language === 'fr' ? 'Terminer' : 'Finish & Exit'}
            </button>
          </div>
        </div>
      )}
      <SubscriptionModal 
        isOpen={isSubModalOpen} 
        onClose={() => setIsSubModalOpen(false)} 
        onSubscribed={() => { setIsSubModalOpen(false); initData(); }} 
      />
    </div>
  );
};
