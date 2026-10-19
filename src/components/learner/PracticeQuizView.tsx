import React, { useEffect, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { Question, Subscription, Language, CombinedAccess } from '../../types';
import { normalizeSubscription, getCombinedAccess } from '../../lib/subscriptionUtils';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { HelpCircle, CheckCircle2, XCircle, ArrowLeft, Lock, Award, RefreshCw } from 'lucide-react';
import { SubscriptionModal } from './SubscriptionModal';
import { getLocalizedQuestionText, getLocalizedQuestionOptions, getLocalizedQuestionExplanation, NotTranslatedBadge } from '../../lib/i18n';

export const PracticeQuizView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { userProfile } = useAuth();
  const { language } = useLanguage();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);
  const [access, setAccess] = useState<CombinedAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');

  const checkSubAndFetch = async () => {
    if (!userProfile) return;
    try {
      // 1. Fetch user subscriptions and compute combined access
      const subsSnap = await getDocs(
        query(collection(db, 'subscriptions'), where('userId', '==', userProfile.uid))
      ).catch(() => null);

      if (subsSnap) {
        const subs = subsSnap.docs.map(d => normalizeSubscription(d.data(), d.id));
        setAccess(getCombinedAccess(subs));
      } else {
        setAccess(getCombinedAccess([]));
      }

      // 2. Fetch published questions
      const qSnap = await getDocs(
        query(collection(db, 'questions'), where('isPublished', '==', true))
      ).catch(err => {
        handleFirestoreError(err, OperationType.LIST, 'questions');
        return null;
      });
      if (qSnap) {
        setQuestions(qSnap.docs.map(d => ({ id: d.id, ...d.data() } as Question)));
      }
    } catch (err) {
      console.error("Error fetching questions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSubAndFetch();
  }, [userProfile]);

  const categories = ['all', ...Array.from(new Set(questions.map(q => q.category)))];
  const filteredQuestions = questions.filter(q => categoryFilter === 'all' || q.category === categoryFilter);

  const currentQ = filteredQuestions[currentIndex];

  const handleSelectOption = (idx: number) => {
    if (selectedOption !== null) return;
    setSelectedOption(idx);
    setShowExplanation(true);
    if (idx === currentQ.correctIndex) {
      setScore(s => s + 1);
    }
  };

  const handleNext = () => {
    setSelectedOption(null);
    setShowExplanation(false);
    setCurrentIndex(i => i + 1);
  };

  const handleReset = () => {
    setCurrentIndex(0);
    setSelectedOption(null);
    setShowExplanation(false);
    setScore(0);
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-6 bg-slate-200 rounded w-32 animate-pulse"></div>
          <div className="h-4 bg-slate-100 rounded w-24 animate-pulse"></div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-8 space-y-6 animate-pulse">
          <div className="h-4 bg-slate-100 rounded w-28"></div>
          <div className="h-6 bg-slate-200 rounded w-3/4"></div>
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 bg-slate-100 rounded-[10px]"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // If trafficRules is specifically locked on an active plan
  if (access?.hasActiveSubscription && !access.trafficRules) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-xl border border-slate-200 p-8 text-center space-y-6 shadow-sm">
        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-slate-900">Practice Quizzes Locked</h3>
          <p className="text-sm text-slate-500 leading-relaxed">
            Your active subscription plan does not include traffic rules practice quizzes. Upgrade your plan to access the full question bank.
          </p>
        </div>
        <div className="space-y-3">
          <button
            onClick={() => setIsSubModalOpen(true)}
            className="w-full min-h-[44px] px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] shadow-sm transition-colors text-sm"
          >
            Upgrade Plan
          </button>
          <button
            onClick={onBack}
            className="w-full min-h-[44px] px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-[10px] transition-colors text-sm"
          >
            Back to Dashboard
          </button>
        </div>
        <SubscriptionModal
          isOpen={isSubModalOpen}
          onClose={() => setIsSubModalOpen(false)}
          onSubscribed={checkSubAndFetch}
        />
      </div>
    );
  }

  // Free preview limit: first 5 questions total if not subscribed
  const isLocked = !access?.hasActiveSubscription && currentIndex >= 5;

  if (isLocked) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-xl border border-slate-200 p-8 text-center space-y-6 shadow-sm">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-slate-900">Free Preview Completed</h3>
          <p className="text-sm text-slate-500 leading-relaxed">
            You completed the 5 free preview practice questions. Upgrade your plan to unlock all Rwandan driving theory question banks.
          </p>
        </div>
        <div className="space-y-3">
          <button
            onClick={() => setIsSubModalOpen(true)}
            className="w-full min-h-[44px] px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] shadow-sm transition-colors text-sm"
          >
            Upgrade to Pro Plan
          </button>
          <button
            onClick={onBack}
            className="w-full min-h-[44px] px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-[10px] transition-colors text-sm"
          >
            Back to Dashboard
          </button>
        </div>
        <SubscriptionModal
          isOpen={isSubModalOpen}
          onClose={() => setIsSubModalOpen(false)}
          onSubscribed={checkSubAndFetch}
        />
      </div>
    );
  }

  if (filteredQuestions.length === 0) {
    return (
      <div className="space-y-6">
        <button onClick={onBack} className="min-h-[44px] flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> 
          <span>Back to Dashboard</span>
        </button>
        <div className="bg-white rounded-xl border border-slate-200 p-10 sm:p-14 text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center mx-auto">
            <HelpCircle className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-900 text-base">No practice questions available</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            {categoryFilter !== 'all' ? `No questions in category "${categoryFilter}".` : "Official exam questions will appear here."}
          </p>
        </div>
      </div>
    );
  }

  const isLastQuestion = currentIndex === filteredQuestions.length - 1;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <button
          onClick={onBack}
          className="min-h-[44px] flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> 
          <span>Back to Dashboard</span>
        </button>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-500 bg-white px-3 py-1.5 rounded-[10px] border border-slate-200">
            Score: <strong className="text-blue-600">{score}</strong> / {currentIndex}
          </span>
          {!access?.hasActiveSubscription && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-[10px] border border-amber-200">
              Preview Mode ({currentIndex + 1} of 5)
            </span>
          )}
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2 pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setCategoryFilter(cat);
              handleReset();
            }}
            className={`min-h-[44px] px-3.5 py-1.5 rounded-[10px] text-xs font-semibold capitalize transition-all ${
              categoryFilter === cat
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Question Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between text-xs text-slate-500 pb-4 border-b border-slate-100">
          <span className="font-bold text-blue-600 uppercase tracking-wider">
            Question {currentIndex + 1} of {filteredQuestions.length}
          </span>
          <span className="bg-slate-100 text-slate-700 font-semibold px-2.5 py-1 rounded-full">
            {currentQ.category}
          </span>
        </div>

        {/* Question Image if exists */}
        {currentQ.imageUrl && (
          <div className="flex justify-center p-3 bg-slate-50 rounded-xl border border-slate-100">
            <img src={currentQ.imageUrl} alt="Road sign" className="max-h-56 object-contain rounded-lg" />
          </div>
        )}

        {/* Question Prompt */}
        {(() => {
          const locText = getLocalizedQuestionText(currentQ, language as Language);
          const locOpts = getLocalizedQuestionOptions(currentQ, language as Language);
          const locExp = getLocalizedQuestionExplanation(currentQ, language as Language);

          return (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                  {locText.text}
                </h2>
                {locText.isFallback && <NotTranslatedBadge />}
              </div>

              {/* Options */}
              <div className="space-y-3">
                {locOpts.isFallback && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50/70 px-3 py-1.5 rounded-lg border border-amber-200/60 mb-1">
                    <NotTranslatedBadge />
                    <span>Options in English (translation pending)</span>
                  </div>
                )}
                {locOpts.options.map((option, idx) => {
                  let optionStyles = 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 text-slate-700';

                  if (selectedOption !== null) {
                    if (idx === currentQ.correctIndex) {
                      optionStyles = 'border-emerald-500 bg-emerald-50 text-emerald-900 font-semibold ring-1 ring-emerald-500';
                    } else if (idx === selectedOption) {
                      optionStyles = 'border-red-500 bg-red-50 text-red-900 ring-1 ring-red-500';
                    } else {
                      optionStyles = 'border-slate-200 opacity-50 text-slate-400';
                    }
                  }

                  return (
                    <button
                      key={idx}
                      disabled={selectedOption !== null}
                      onClick={() => handleSelectOption(idx)}
                      className={`w-full min-h-[44px] p-4 text-left rounded-[10px] border transition-all text-sm flex items-center justify-between gap-3 ${optionStyles}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span>{option}</span>
                      </div>
                      {selectedOption !== null && idx === currentQ.correctIndex && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      )}
                      {selectedOption === idx && idx !== currentQ.correctIndex && (
                        <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Explanation Banner */}
              {showExplanation && (
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-1.5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-blue-900 uppercase">Rwanda Gazette Explanation:</h4>
                    {locExp.isFallback && <NotTranslatedBadge />}
                  </div>
                  <p className="text-xs sm:text-sm text-blue-800 leading-relaxed">
                    {locExp.explanation || "Official Rwanda traffic regulations determine this answer."}
                  </p>
                </div>
              )}
            </>
          );
        })()}

        {/* Next / Reset Button */}
        {selectedOption !== null && (
          <div className="flex justify-end pt-2">
            {isLastQuestion ? (
              <button
                onClick={handleReset}
                className="min-h-[44px] px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] shadow-sm transition-colors text-sm flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Restart Quiz</span>
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="min-h-[44px] px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] shadow-sm transition-colors text-sm"
              >
                Next Question →
              </button>
            )}
          </div>
        )}
      </div>

      <SubscriptionModal
        isOpen={isSubModalOpen}
        onClose={() => setIsSubModalOpen(false)}
        onSubscribed={checkSubAndFetch}
      />
    </div>
  );
};
