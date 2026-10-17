import React, { useEffect, useState, useRef } from 'react';
import { db, functions } from '../../lib/firebase';
import { collection, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { handleFirestoreError, OperationType } from '../../lib/firestoreUtils';
import { Plan, Promotion } from '../../types';
import { normalizePlan } from '../../lib/subscriptionUtils';
import { getBestPromotion } from '../../lib/promotionUtils';
import { formatCountdown } from '../../lib/timeUtils';
import { useAuth } from '../../context/AuthContext';
import { normalizeRwandanPhone, detectNetwork } from '../../lib/phoneUtils';
import { Award, Check, X, ShieldCheck, CreditCard, Star, AlertCircle, Smartphone, RefreshCw } from 'lucide-react';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscribed: () => void;
}

type ModalPaymentStep = 'select_and_pay' | 'waiting_prompt' | 'success' | 'failed';

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose, onSubscribed }) => {
  const { userProfile, language } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const network = phone ? detectNetwork(phone) : null;
  const [step, setStep] = useState<ModalPaymentStep>('select_and_pay');
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const unsubscribeSnapshotRef = useRef<(() => void) | null>(null);

  // Clean up Firestore listener on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeSnapshotRef.current) {
        unsubscribeSnapshotRef.current();
        unsubscribeSnapshotRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    async function fetchPlansAndPromos() {
      try {
        const snap = await getDocs(collection(db, 'plans')).catch((err) => {
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
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan || !userProfile) return;

    const normalizedPhone = normalizeRwandanPhone(phone);
    if (!normalizedPhone || !network) {
      setErrorMsg('Please enter a valid Rwandan MTN (078/079) or Airtel (072/073) number.');
      return;
    }

    setProcessing(true);
    setErrorMsg(null);

    try {
      let paymentId = '';

      // Try local full-stack server route first
      try {
        const resp = await fetch('/api/paypack/start-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: selectedPlan.id,
            phone: normalizedPhone,
            userId: userProfile.uid,
            userEmail: userProfile.email,
          }),
        });
        if (resp.ok) {
          const resData = await resp.json();
          paymentId = resData.paymentId;
        }
      } catch (e) {
        console.warn('Direct server start-payment skipped, falling back to callable:', e);
      }

      // Fallback to Cloud Function callable if server route was unavailable
      if (!paymentId) {
        const startPaymentCallable = httpsCallable<{ planId: string; phone: string }, { success: boolean; paymentId: string; paypackRef: string }>(
          functions,
          'startPayment'
        );
        const result = await startPaymentCallable({
          planId: selectedPlan.id,
          phone: normalizedPhone,
        });
        paymentId = result.data.paymentId;
      }

      setActivePaymentId(paymentId);
      setStep('waiting_prompt');
      setProcessing(false);

      // Listen in real-time (onSnapshot) to the payment document in Firestore
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
      const message = err?.message || 'Failed to start payment. Please check your phone number and connection.';
      setErrorMsg(message);
      setProcessing(false);
    }
  };

  const handleTryAgain = () => {
    if (unsubscribeSnapshotRef.current) {
      unsubscribeSnapshotRef.current();
      unsubscribeSnapshotRef.current = null;
    }
    setStep('select_and_pay');
    setErrorMsg(null);
    setProcessing(false);
  };

  const handleModalClose = () => {
    if (unsubscribeSnapshotRef.current) {
      unsubscribeSnapshotRef.current();
      unsubscribeSnapshotRef.current = null;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-xl bg-white rounded-xl shadow-xl overflow-hidden border border-slate-100 p-6 sm:p-8 space-y-6 my-6">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-[10px] flex items-center justify-center shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900">Choose a TSINDA Study Plan</h3>
              <p className="text-xs sm:text-sm text-slate-500">Rwanda National Gazette driving theory exam preparation.</p>
            </div>
          </div>
          <button
            onClick={handleModalClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-[10px] transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && step !== 'failed' && (
          <div className="p-3 bg-red-50 text-red-700 rounded-[10px] text-xs font-semibold flex items-center gap-2 border border-red-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* STEP: WAITING FOR USSD PROMPT */}
        {step === 'waiting_prompt' && (
          <div className="py-8 text-center space-y-5">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-60"></div>
              <div className="relative w-20 h-20 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg">
                <Smartphone className="w-10 h-10 animate-bounce" />
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-lg font-bold text-slate-900">Check your phone and approve the payment</h4>
              <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                A secure payment request for <span className="font-bold text-slate-900">RWF {selectedPlan?.price.toLocaleString()}</span> has been sent to{' '}
                <span className="font-bold text-slate-900">{phone}</span> ({network}).
              </p>
              <p className="text-xs text-slate-500">
                Please enter your Mobile Money PIN on your phone. This screen will update automatically once confirmed.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-4 py-2 rounded-full font-medium">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Waiting for approval from {network} MoMo...</span>
            </div>

            <div className="pt-4 border-t border-slate-100">
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
          <div className="py-10 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
              <ShieldCheck className="w-9 h-9" />
            </div>
            <h4 className="text-xl font-bold text-slate-900">Subscription Activated!</h4>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Your payment of <span className="font-semibold text-slate-900">RWF {selectedPlan?.price.toLocaleString()}</span> was verified by Paypack. All features and mock exams for your pass are now unlocked.
            </p>
          </div>
        )}

        {/* STEP: FAILED */}
        {step === 'failed' && (
          <div className="py-8 text-center space-y-5">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <X className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h4 className="text-lg font-bold text-slate-900">Payment Unsuccessful</h4>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                {errorMsg || 'The transaction was cancelled or declined on your mobile device.'}
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleTryAgain}
                className="min-h-[44px] px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] text-sm shadow-sm transition-colors"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={handleModalClose}
                className="min-h-[44px] px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-[10px] text-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* STEP: SELECT AND PAY */}
        {step === 'select_and_pay' && (
          <form onSubmit={handleStartPayment} className="space-y-6">
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Select Your Plan
              </label>

              <div className="grid grid-cols-1 gap-3">
                {plans.map((plan) => {
                  const isSelected = selectedPlan?.id === plan.id;
                  const localizedName = plan.name[language] || plan.name.en;
                  const localizedDesc = plan.description[language] || plan.description.en;
                  const promoInfo = getBestPromotion(plan.id, plan.price, promotions);

                  return (
                    <div
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all relative ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/50 shadow-xs ring-2 ring-blue-600/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      {plan.isRecommended && (
                        <span className="absolute top-3 right-3 bg-blue-600 text-white text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                          <Star className="w-2.5 h-2.5 fill-current" />
                          <span>Recommended</span>
                        </span>
                      )}

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pr-20">
                        <div>
                          <div className="font-bold text-slate-900 text-sm sm:text-base">{localizedName}</div>
                          {localizedDesc && (
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{localizedDesc}</p>
                          )}
                          {promoInfo.hasPromotion && (
                            <div className="text-[10px] font-bold text-rose-600 mt-1">
                              {typeof (promoInfo.activePromo as any)?.label === 'object' 
                                ? (promoInfo.activePromo as any)?.label[language] 
                                : (promoInfo.activePromo as any)?.label}
                              {' - '} {formatCountdown((promoInfo.activePromo as any)!.endAt)}
                            </div>
                          )}
                        </div>

                        <div className="text-left sm:text-right shrink-0">
                          <div className="flex items-center gap-2 justify-start sm:justify-end">
                            {promoInfo.hasPromotion && (
                              <span className="text-xs text-slate-400 line-through">RWF {plan.price.toLocaleString()}</span>
                            )}
                            <div className="text-lg sm:text-xl font-extrabold text-blue-600">
                              RWF {promoInfo.discountedPrice.toLocaleString()}
                            </div>
                          </div>
                          {promoInfo.hasPromotion && (
                             <div className="text-[10px] font-bold text-white bg-rose-500 px-1.5 py-0.5 rounded inline-block">
                               {promoInfo.discountBadge}
                             </div>
                          )}
                          <div className="text-[11px] text-slate-500">{plan.durationDays} days access</div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2.5 border-t border-slate-100 text-xs">
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

            {/* Payment Method & Phone */}
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">
                  Mobile Money Phone Number (MTN or Airtel)
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="078XXXXXXX or 072XXXXXXX"
                    className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-[10px] border ${
                      network ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-200'
                    } text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600`}
                  />
                  {network && (
                    <div className="absolute right-3.5 top-2.5 text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                      {network} MoMo
                    </div>
                  )}
                </div>
                {!network && phone.length > 2 && (
                  <p className="text-xs text-amber-600 mt-1">Please enter an MTN (078/079) or Airtel (072/073) number.</p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={processing || !selectedPlan || !network}
              className="w-full min-h-[44px] py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[10px] shadow-sm transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              <span>
                {processing
                  ? 'Initiating Paypack Payment...'
                  : `Pay RWF ${selectedPlan?.price.toLocaleString() || 0} via Paypack`}
              </span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
