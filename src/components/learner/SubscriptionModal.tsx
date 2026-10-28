import React, { useEffect, useState, useRef } from 'react';
import { db, auth } from '../../lib/firebase';
import { collection, getDocs, doc, onSnapshot, query, where } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { Plan, Promotion } from '../../types';
import { normalizePlan } from '../../lib/subscriptionUtils';
import { getBestPromotion } from '../../lib/promotionUtils';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { normalizePhone, validatePhone, detectNetwork } from '../../lib/phoneUtils';
import { Award, Check, X, ShieldCheck, CreditCard, Star, AlertCircle, Smartphone, RefreshCw } from 'lucide-react';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscribed: () => void;
}

type ModalPaymentStep = 'select_and_pay' | 'waiting_prompt' | 'success' | 'failed';

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose, onSubscribed }) => {
  const { userProfile } = useAuth();
  const { language } = useLanguage();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [activeSub, setActiveSub] = useState<{ planName: string; endDate: string } | null>(null);
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const network = phone ? detectNetwork(phone) : null;
  const [step, setStep] = useState<ModalPaymentStep>('select_and_pay');
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [activePaymentAmount, setActivePaymentAmount] = useState<number | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [pointsBalance, setPointsBalance] = useState<number>(0);
  const [pointValueRwf, setPointValueRwf] = useState<number>(1);
  const [usePoints, setUsePoints] = useState<boolean>(false);
  const unsubscribeSnapshotRef = useRef<(() => void) | null>(null);
  const pollIntervalRef = useRef<any>(null);
  const checkingStatusRef = useRef(false);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const checkPaymentNow = async (paymentId: string) => {
    if (checkingStatusRef.current) return;
    try {
      checkingStatusRef.current = true;
      setCheckingStatus(true);
      const res = await fetch(`/api/payments/${paymentId}/check-status`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'successful' || data.status === 'success') {
          stopPolling();
          if (unsubscribeSnapshotRef.current) {
            unsubscribeSnapshotRef.current();
            unsubscribeSnapshotRef.current = null;
          }
          setStep('success');
          setTimeout(() => {
            onSubscribed();
            onClose();
          }, 2000);
          return;
        } else if (data.status === 'failed') {
          stopPolling();
          if (unsubscribeSnapshotRef.current) {
            unsubscribeSnapshotRef.current();
            unsubscribeSnapshotRef.current = null;
          }
          setStep('failed');
          setErrorMsg(data.failureReason || 'Payment declined or cancelled. Please try again.');
          return;
        }
      }
    } catch (e) {
      console.warn('Polling check error:', e);
    } finally {
      checkingStatusRef.current = false;
      setCheckingStatus(false);
    }
  };

  const formatCatDate = (dateInput: string | Date | number): string => {
    const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
    if (!d || isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Kigali',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);

    const day = parts.find(p => p.type === 'day')?.value || '';
    const month = parts.find(p => p.type === 'month')?.value || '';
    const year = parts.find(p => p.type === 'year')?.value || '';
    const hour = parts.find(p => p.type === 'hour')?.value || '';
    const minute = parts.find(p => p.type === 'minute')?.value || '';

    return `${day}/${month}/${year} ${hour}:${minute} CAT`;
  };

  // Clean up Firestore listener & interval on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      if (unsubscribeSnapshotRef.current) {
        unsubscribeSnapshotRef.current();
        unsubscribeSnapshotRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    async function fetchPlansAndPromos() {
      try {
        const snap = await getDocs(query(collection(db, 'plans'), where('isActive', '==', true))).catch((err) => {
          handleFirestoreError(err, OperationType.LIST, 'plans');
          return null;
        });
        if (snap) {
          const list = snap.docs.map((d) => normalizePlan(d.data(), d.id)).filter((p) => p.isActive);
          list.sort((a, b) => a.sortOrder - b.sortOrder);
          setPlans(list);
          if (list.length > 0) {
            const rec = list.find((p) => p.isRecommended) || list[0];
            setSelectedPlan(rec);
          }
        }

        const promoSnap = await getDocs(collection(db, 'promotions')).catch(() => null);
        if (promoSnap) {
          setPromotions(promoSnap.docs.map(d => ({ id: d.id, ...d.data() } as Promotion)));
        }

        if (userProfile?.uid) {
          const subsSnap = await getDocs(
            query(collection(db, 'subscriptions'), where('userId', '==', userProfile.uid))
          ).catch(() => null);

          if (subsSnap) {
            const now = new Date();
            // Only active STUDY plans (trafficRules or lessonVideos) expire by time and block new purchases
            const active = subsSnap.docs
              .map(d => d.data() as { planName?: string; endDate?: string; status?: string; access?: any })
              .find(s => s.status === 'active' && Boolean(s.access?.trafficRules || s.access?.lessonVideos) && s.endDate && new Date(s.endDate) > now);

            if (active && active.endDate) {
              setActiveSub({
                planName: active.planName || 'Active Study Plan',
                endDate: active.endDate,
              });
            } else {
              setActiveSub(null);
            }
          }

          // Fetch referral points balance and point value
          const idToken = await auth.currentUser?.getIdToken();
          if (idToken) {
            fetch('/api/referral/stats', {
              headers: { Authorization: `Bearer ${idToken}` }
            })
              .then(res => res.json())
              .then(data => {
                if (data.pointsBalance !== undefined) {
                  setPointsBalance(Number(data.pointsBalance) || 0);
                }
                if (data.pointValueRwf !== undefined) {
                  setPointValueRwf(Number(data.pointValueRwf) || 1);
                }
              })
              .catch(e => console.warn('Error fetching referral stats:', e));
          }
        }
      } catch (err) {
        console.error('Error fetching plans/promotions:', err);
      }
    }
    if (isOpen) {
      fetchPlansAndPromos();
      setStep('select_and_pay');
      setErrorMsg(null);
      setProcessing(false);
    }
  }, [isOpen, userProfile]);

  const handleStartPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan || !userProfile) return;
    const isStudy = Boolean(selectedPlan.access?.trafficRules || selectedPlan.access?.lessonVideos);
    if (activeSub && isStudy) {
      setErrorMsg(
        language === 'rw'
          ? `Ufite ifatabuguzi ry'amasomo rikora kugeza ${formatCatDate(activeSub.endDate)}. Ntabwo wemerewe kugura irindi kugeza iryambere rirangiye.`
          : language === 'fr'
          ? `Vous avez déjà un plan d'étude actif jusqu'au ${formatCatDate(activeSub.endDate)}. Vous ne pouvez pas souscrire à un nouveau plan tant que celui-ci est actif.`
          : `You already have an active study plan until ${formatCatDate(activeSub.endDate)}. You cannot purchase a new study plan until it expires.`
      );
      return;
    }

    const promoInfo = getBestPromotion(selectedPlan.id, selectedPlan.price, promotions);
    const effectivePrice = promoInfo.discountedPrice;
    const pointsDiscountMax = Math.min(pointsBalance, Math.ceil(effectivePrice / (pointValueRwf || 1)));
    const appliedPoints = usePoints ? pointsDiscountMax : 0;
    const pointsDiscountRwf = appliedPoints * (pointValueRwf || 1);
    const finalPayableRwf = Math.max(0, effectivePrice - pointsDiscountRwf);
    const isFreeWithPoints = usePoints && finalPayableRwf === 0;

    let normalizedPhone = '';
    if (!isFreeWithPoints) {
      normalizedPhone = normalizePhone(phone) || '';
      if (!normalizedPhone || !validatePhone(normalizedPhone)) {
        setErrorMsg(
          language === 'rw'
            ? 'Nyamuneka andika nimero nyayo ya MTN (078/079) cyangwa Airtel (072/073).'
            : language === 'fr'
            ? 'Veuillez saisir un numéro valide MTN (078/079) ou Airtel (072/073).'
            : 'Please enter a valid Rwandan MTN (078/079) or Airtel (072/073) number.'
        );
        return;
      }
    }

    setProcessing(true);
    setErrorMsg(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('Please sign in to initiate payment.');
      }

      const res = await fetch('/api/payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          planId: selectedPlan.id,
          phone: normalizedPhone || undefined,
          redeemPoints: appliedPoints > 0 ? appliedPoints : undefined,
          promotionId: promoInfo.activePromo?.id || undefined,
          expectedPrice: finalPayableRwf,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        if (res.status === 409 || result.error === 'STUDY_PLAN_ACTIVE' || result.code === 'STUDY_PLAN_ACTIVE') {
          const dateStr = result.expiresAt ? formatCatDate(result.expiresAt) : (activeSub ? formatCatDate(activeSub.endDate) : '');
          setErrorMsg(
            language === 'rw'
              ? `Ufite ifatabuguzi ry'amasomo rikora kugeza ${dateStr}. Ntabwo wemerewe kugura irindi mugihe iri rigikora.`
              : language === 'fr'
              ? `Vous avez déjà un plan d'étude actif jusqu'au ${dateStr}. Vous ne pouvez pas en acheter un nouveau tant que celui-ci est actif.`
              : `You already have an active study plan expiring on ${dateStr}. You cannot purchase another study plan until it expires.`
          );
          setProcessing(false);
          return;
        }
        const error = new Error(result.message || result.error || 'Payment initiation failed') as any;
        error.code = result.code;
        error.details = result;
        throw error;
      }

      // If 100% free with points, activated immediately!
      if (result.freeWithPoints) {
        setStep('success');
        setProcessing(false);
        setTimeout(() => {
          onSubscribed();
          onClose();
        }, 1800);
        return;
      }

      const paymentId = result.paymentId;
      const chargedAmount = result.amount !== undefined ? result.amount : finalPayableRwf;

      setActivePaymentId(paymentId);
      setActivePaymentAmount(chargedAmount);
      setStep('waiting_prompt');
      setProcessing(false);

      // 1. Start automatic polling interval (every 2 seconds after payment enters pending queue)
      stopPolling();
      setTimeout(() => {
        checkPaymentNow(paymentId);
      }, 1000);

      pollIntervalRef.current = setInterval(() => {
        checkPaymentNow(paymentId);
      }, 2000);

      // 2. Listen in real-time (onSnapshot) to the payment document in Firestore
      if (unsubscribeSnapshotRef.current) {
        unsubscribeSnapshotRef.current();
      }

      unsubscribeSnapshotRef.current = onSnapshot(
        doc(db, 'payments', paymentId),
        (docSnap) => {
          if (!docSnap.exists()) return;
          const data = docSnap.data();
          const status = data.status;

          if (status === 'successful' || status === 'success') {
            stopPolling();
            setStep('success');
            if (unsubscribeSnapshotRef.current) {
              unsubscribeSnapshotRef.current();
              unsubscribeSnapshotRef.current = null;
            }
            setTimeout(() => {
              onSubscribed();
              onClose();
            }, 2000);
          } else if (status === 'failed') {
            stopPolling();
            setStep('failed');
            setErrorMsg(data.failureReason || 'Payment was declined or timed out. Please try again.');
            if (unsubscribeSnapshotRef.current) {
              unsubscribeSnapshotRef.current();
              unsubscribeSnapshotRef.current = null;
            }
          }
        },
        (err) => {
          console.error('Error listening to payment updates:', err);
        }
      );
    } catch (err: any) {
      console.error('Error initiating Paypack payment:', err);
      const code = err?.details?.code || err?.code || '';
      const msg = err?.message || '';

      if (code === 'ACTIVE_PLAN_EXISTS' || msg.includes('ACTIVE_PLAN_EXISTS')) {
        const subDate = (activeSub as { endDate?: string } | null)?.endDate;
        const endDateFormatted = err?.details?.endDate ? formatCatDate(err.details.endDate) : (subDate ? formatCatDate(subDate) : '');
        const errorText =
          language === 'rw'
            ? `Ufite ifatabuguzi rikora kugeza ${endDateFormatted}. Ntushobora kugura irindi mugihe iri rigikora.`
            : language === 'fr'
            ? `Vous avez déjà un abonnement actif jusqu'au ${endDateFormatted}. Vous ne pouvez pas souscrire à un nouveau plan tant que celui-ci est actif.`
            : `You already have an active plan until ${endDateFormatted}. You cannot purchase a new plan while one is active.`;
        setErrorMsg(errorText);
      } else if (code === 'PENDING_PAYMENT_EXISTS' || msg.includes('PENDING_PAYMENT_EXISTS')) {
        const errorText =
          language === 'rw'
            ? 'Ufite ubwishyu burimo gutegerezwa bwatangiye mu minota 3 ishize. Reba kuri telefone yawe wemeze kode ya USSD.'
            : language === 'fr'
            ? 'Une demande de paiement initiée il y a moins de 3 minutes est en cours. Veuillez vérifier votre téléphone pour le message USSD.'
            : 'You have a pending payment request initiated within the last 3 minutes. Please check your phone for the USSD prompt.';
        setErrorMsg(errorText);
      } else {
        setErrorMsg(
          language === 'rw'
            ? 'Gutangiza ubwishyu byanze. Nyamuneka ongera ugerageze.'
            : language === 'fr'
            ? "L'initiation du paiement a échoué. Veuillez réessayer."
            : err?.message || 'Failed to start payment. Please check your phone number and connection.'
        );
      }
      setProcessing(false);
    }
  };

  const handleTryAgain = () => {
    stopPolling();
    if (unsubscribeSnapshotRef.current) {
      unsubscribeSnapshotRef.current();
      unsubscribeSnapshotRef.current = null;
    }
    setActivePaymentAmount(null);
    setStep('select_and_pay');
    setErrorMsg(null);
    setProcessing(false);
  };

  const handleModalClose = () => {
    stopPolling();
    if (unsubscribeSnapshotRef.current) {
      unsubscribeSnapshotRef.current();
      unsubscribeSnapshotRef.current = null;
    }
    setActivePaymentAmount(null);
    onClose();
  };

  // Lock body scroll and listen for Escape key when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleModalClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const promoInfo = selectedPlan ? getBestPromotion(selectedPlan.id, selectedPlan.price, promotions) : { discountedPrice: 0, hasPromotion: false, discountBadge: '' };
  const effectivePrice = promoInfo.discountedPrice;
  const pointsDiscountMax = Math.min(pointsBalance, Math.ceil(effectivePrice / (pointValueRwf || 1)));
  const appliedPoints = usePoints ? pointsDiscountMax : 0;
  const pointsDiscountRwf = appliedPoints * (pointValueRwf || 1);
  const finalPayableRwf = Math.max(0, effectivePrice - pointsDiscountRwf);
  const isFreeWithPoints = usePoints && finalPayableRwf === 0;

  const isSelectedPlanStudy = Boolean(selectedPlan?.access?.trafficRules || selectedPlan?.access?.lessonVideos);
  const isBlockedByActiveStudyPlan = Boolean(activeSub && isSelectedPlanStudy);
  const isButtonDisabled = processing || isBlockedByActiveStudyPlan || !selectedPlan || (!isFreeWithPoints && !network);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150 overflow-hidden"
      onClick={handleModalClose}
    >
      <div 
        className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* STICKY HEADER */}
        <div className="px-5 py-4 sm:px-6 sm:py-4.5 border-b border-slate-100 flex items-center justify-between gap-3 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0 shadow-2xs">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                {language === 'rw' ? 'Hitamo Ifatabuguzi rya TSINDA' : language === 'fr' ? 'Choisissez un plan TSINDA' : 'Choose a TSINDA Study Plan'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {language === 'rw' ? 'Amategeko y’umuhanda & ibizamini byo kwimenyereza' : language === 'fr' ? 'Code de la route officiel & examens blancs' : 'Rwanda National Gazette driving theory & mock exams'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleModalClose}
            className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors shrink-0"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5 space-y-4 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
          {activeSub && (
            <div className="p-3.5 bg-emerald-50 text-emerald-800 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2.5 border border-emerald-200">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <span>
                  {language === 'rw'
                    ? `Ufite ifatabuguzi rikora kugeza ${formatCatDate(activeSub.endDate)}`
                    : language === 'fr'
                    ? `Vous avez un abonnement actif jusqu'au ${formatCatDate(activeSub.endDate)}`
                    : `You have an active plan until ${formatCatDate(activeSub.endDate)}`}
                </span>
              </div>
            </div>
          )}

          {errorMsg && step !== 'failed' && (
            <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold flex items-center gap-2 border border-red-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP: WAITING FOR USSD PROMPT */}
          {step === 'waiting_prompt' && (
            <div className="py-6 text-center space-y-4">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-60"></div>
                <div className="relative w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg">
                  <Smartphone className="w-8 h-8 animate-bounce" />
                </div>
              </div>

              <div className="space-y-1.5">
                <h4 className="text-base sm:text-lg font-bold text-slate-900">
                  {language === 'rw' ? 'Reba kuri telefone yawe wemeze ubwishyu' : 'Check your phone and approve payment'}
                </h4>
                <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                  A payment request of <span className="font-bold text-slate-900">RWF {(activePaymentAmount !== null ? activePaymentAmount : finalPayableRwf).toLocaleString()}</span> was sent to{' '}
                  <span className="font-bold text-slate-900">{phone}</span> ({network}).
                </p>
                <p className="text-xs text-slate-500">
                  Please enter your Mobile Money PIN. This dialog will update automatically once confirmed.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
                <div className="inline-flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-3.5 py-1.5 rounded-full font-medium">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Waiting for {network} MoMo approval...</span>
                </div>

                {activePaymentId && (
                  <button
                    type="button"
                    onClick={() => checkPaymentNow(activePaymentId)}
                    disabled={checkingStatus}
                    className="min-h-[36px] px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checkingStatus ? 'animate-spin' : ''}`} />
                    <span>{checkingStatus ? 'Checking...' : (language === 'rw' ? 'Reba niba byemejwe' : 'Check Status Now')}</span>
                  </button>
                )}
              </div>

              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                {network === 'Airtel' 
                  ? 'Niba ubutumwa bwa USSD butinze, kanda *182*7*1# kuri Airtel yawe wemeze ubwishyu.'
                  : 'Niba ubutumwa bwa USSD butinze, kanda *182*7*1# kuri MTN yawe wemeze ubwishyu.'}
              </p>

              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleTryAgain}
                  className="text-xs text-slate-500 hover:text-slate-800 underline transition-colors"
                >
                  Cancel or use a different phone number
                </button>
              </div>
            </div>
          )}

          {/* STEP: SUCCESS */}
          {step === 'success' && (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
                <ShieldCheck className="w-9 h-9" />
              </div>
              <h4 className="text-xl font-bold text-slate-900">Subscription Activated!</h4>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                Your payment of <span className="font-semibold text-slate-900">RWF {(activePaymentAmount !== null ? activePaymentAmount : finalPayableRwf).toLocaleString()}</span> was verified by Paypack. All features and mock exams for your pass are now unlocked.
              </p>
            </div>
          )}

          {/* STEP: FAILED */}
          {step === 'failed' && (
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                <X className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-900">Payment Unsuccessful</h4>
                <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
                  {errorMsg || 'The transaction was cancelled or declined on your mobile device.'}
                </p>
              </div>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleTryAgain}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-sm transition-colors"
                >
                  Try Again
                </button>
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs sm:text-sm transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* STEP: SELECT AND PAY CONTENT */}
          {step === 'select_and_pay' && (
            <div className="space-y-4">
              <div className="space-y-2.5">
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {language === 'rw' ? 'Hitamo Porogaramu' : 'Select Your Plan'}
                </label>

                <div className="grid grid-cols-1 gap-2.5">
                  {plans.map((plan) => {
                    const isSelected = selectedPlan?.id === plan.id;
                    const localizedName = plan.name[language] || plan.name.en;
                    const localizedDesc = plan.description[language] || plan.description.en;
                    const itemPromo = getBestPromotion(plan.id, plan.price, promotions);
                    const isPlanStudy = Boolean(plan.access?.trafficRules || plan.access?.lessonVideos);
                    const isPlanActiveConflict = Boolean(activeSub && isPlanStudy);

                    return (
                      <div
                        key={plan.id}
                        onClick={() => setSelectedPlan(plan)}
                        className={`p-3.5 sm:p-4 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/40 shadow-xs ring-1.5 ring-blue-600/30'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0">
                            {/* Custom Radio Button */}
                            <div className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 transition-colors ${
                              isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'
                            }`}>
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-900 text-sm sm:text-base leading-snug">
                                  {localizedName}
                                </span>
                                {plan.isRecommended && (
                                  <span className="bg-blue-600 text-white text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs">
                                    <Star className="w-2.5 h-2.5 fill-current" />
                                    <span>{language === 'rw' ? 'Icyasabwe' : 'Recommended'}</span>
                                  </span>
                                )}
                                {isPlanActiveConflict && (
                                  <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-200">
                                    Active until {formatCatDate(activeSub!.endDate)}
                                  </span>
                                )}
                              </div>
                              {localizedDesc && (
                                <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{localizedDesc}</p>
                              )}
                            </div>
                          </div>

                          {/* Price column */}
                          <div className="text-right shrink-0">
                            <div className="flex items-center gap-1.5 justify-end">
                              {itemPromo.hasPromotion && (
                                <span className="text-xs text-slate-400 line-through">RWF {plan.price.toLocaleString()}</span>
                              )}
                              <div className="text-base sm:text-lg font-extrabold text-blue-600">
                                RWF {itemPromo.discountedPrice.toLocaleString()}
                              </div>
                            </div>
                            <div className={`text-[10px] sm:text-[11px] font-medium ${isPlanStudy ? 'text-slate-500' : 'text-emerald-700 font-semibold'}`}>
                              {isPlanStudy ? `${plan.durationDays} days access` : 'No Expiration • Count-based'}
                            </div>
                          </div>
                        </div>

                        {/* Feature Pills */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2 border-t border-slate-100 text-xs">
                          {plan.access.trafficRules && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>Traffic Rules</span>
                            </span>
                          )}
                          {plan.access.lessonVideos && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                              <Check className="w-3 h-3 text-purple-600" />
                              <span>Video Lessons</span>
                            </span>
                          )}
                          {plan.access.exams ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                              <Check className="w-3 h-3 text-blue-600" />
                              <span>{plan.examLimit === null ? 'Unlimited Exams' : `${plan.examLimit} Mock Exams`}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded line-through">
                              <span>Exams Locked</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Points Redemption Option */}
              {pointsBalance > 0 && selectedPlan && (
                <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">🪙</span>
                      <div>
                        <div className="text-xs sm:text-sm font-bold text-amber-900">
                          Redeem TSINDA Coins ({pointsBalance} Available)
                        </div>
                        <div className="text-[11px] text-amber-700">
                          1 Coin = {pointValueRwf} RWF • Max {pointsDiscountMax} Coins applicable
                        </div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={usePoints}
                        onChange={(e) => setUsePoints(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                    </label>
                  </div>
                  {usePoints && (
                    <div className="text-xs font-semibold text-amber-900 pt-1.5 border-t border-amber-200/60 flex items-center justify-between">
                      <span>Applying {pointsDiscountMax} Coins Discount:</span>
                      <span className="font-bold text-emerald-700">-RWF {pointsDiscountRwf.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Mobile Money Phone Input */}
              {isFreeWithPoints ? (
                <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 text-xs sm:text-sm text-emerald-800 font-bold flex items-center gap-2">
                  <Check className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>100% Free! This plan is fully covered by your {pointsDiscountMax} coins. No mobile money payment required.</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Mobile Money Phone Number (MTN or Airtel)
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="078XXXXXXX or 072XXXXXXX"
                      className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border ${
                        network ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200'
                      } text-sm focus:outline-none focus:ring-2 focus:ring-blue-600`}
                    />
                    {network && (
                      <div className="absolute right-2.5 top-2 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md border border-blue-200">
                        {network} MoMo
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Example: 0788123456</span>
                    {!network && phone.length > 2 && (
                      <span className="text-amber-600 font-medium">Please enter MTN (078/079) or Airtel (072/073).</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* STICKY FOOTER (ALWAYS VISIBLE FOR SELECT & PAY) */}
        {step === 'select_and_pay' && (
          <div className="px-5 py-3.5 sm:px-6 sm:py-4 border-t border-slate-100 bg-slate-50/90 backdrop-blur-xs shrink-0 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleStartPayment}
              disabled={isButtonDisabled}
              className={`w-full min-h-[46px] py-3 px-4 font-bold rounded-xl shadow-sm transition-all text-sm flex items-center justify-center gap-2 cursor-pointer ${
                isBlockedByActiveStudyPlan
                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed border border-slate-300'
                  : isFreeWithPoints
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50'
                  : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>
                {isBlockedByActiveStudyPlan
                  ? (language === 'rw'
                      ? `Ufite ifatabuguzi rikora kugeza ${formatCatDate(activeSub!.endDate)}`
                      : language === 'fr'
                      ? `Plan d'étude actif jusqu'au ${formatCatDate(activeSub!.endDate)}`
                      : `Active Study Plan Expires on ${formatCatDate(activeSub!.endDate)}`)
                  : processing
                  ? (language === 'rw' ? 'Ubwishyu burimo gutegurwa...' : language === 'fr' ? 'Initialisation du paiement...' : 'Activating...')
                  : isFreeWithPoints
                  ? `🎉 Activate 100% Free with ${pointsDiscountMax} Coins`
                  : `${language === 'rw' ? 'Ishyura' : language === 'fr' ? 'Payer' : 'Pay'} RWF ${finalPayableRwf.toLocaleString()}`}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

