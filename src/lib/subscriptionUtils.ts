import { Plan, Subscription, CombinedAccess, PlanAccess, Language } from '../types';

/**
 * Normalizes plan data from Firestore, providing safe defaults if fields are missing or older schema.
 */
export function normalizePlan(raw: any, id: string): Plan {
  const name: Record<Language, string> = typeof raw.name === 'object' && raw.name
    ? { 
        rw: raw.name.rw || raw.name.en || 'Gahunda', 
        en: raw.name.en || raw.name.rw || 'Plan', 
        fr: raw.name.fr || raw.name.en || 'Plan' 
      }
    : { rw: String(raw.name || 'Gahunda'), en: String(raw.name || 'Plan'), fr: String(raw.name || 'Plan') };

  const description: Record<Language, string> = typeof raw.description === 'object' && raw.description
    ? { 
        rw: raw.description.rw || raw.description.en || '', 
        en: raw.description.en || raw.description.rw || '', 
        fr: raw.description.fr || raw.description.en || '' 
      }
    : { rw: String(raw.description || ''), en: String(raw.description || ''), fr: String(raw.description || '') };

  const hasExplicitAccess = Boolean(raw.access && typeof raw.access === 'object');
  const isStudyPlan = hasExplicitAccess
    ? Boolean(raw.access.lessonVideos || raw.access.trafficRules)
    : Boolean(raw.features?.lessons || raw.features?.videos || raw.examLimit === null || raw.examLimit === undefined);

  const access: PlanAccess = isStudyPlan
    ? { lessonVideos: true, trafficRules: true, exams: true }
    : { lessonVideos: false, trafficRules: false, exams: true };

  const rawDays = Number(raw.durationDays);
  const durationDays = isStudyPlan
    ? (Number.isFinite(rawDays) && rawDays >= 1 ? Math.floor(rawDays) : 1)
    : 0;

  const rawLimit = raw.examLimit ?? raw.examsAllowed ?? raw.examCredits;
  const parsedLimit = Number(rawLimit);
  const examLimit = isStudyPlan
    ? null
    : (Number.isFinite(parsedLimit) && parsedLimit >= 1 ? Math.floor(parsedLimit) : 5);

  return {
    id,
    name,
    description,
    price: typeof raw.price === 'number' ? raw.price : 1000,
    durationDays,
    access,
    examLimit,
    isActive: raw.isActive !== undefined ? Boolean(raw.isActive) : true,
    isRecommended: Boolean(raw.isRecommended),
    sortOrder: typeof raw.sortOrder === 'number' ? raw.sortOrder : 0,
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

/**
 * Normalizes subscription data from Firestore, preserving canonical plan rules.
 */
export function normalizeSubscription(raw: any, id: string): Subscription {
  const hasExplicitAccess = Boolean(raw.access && typeof raw.access === 'object');
  const isStudyPlan = hasExplicitAccess
    ? Boolean(raw.access.lessonVideos || raw.access.trafficRules)
    : Boolean(raw.features?.lessons || raw.features?.videos || raw.lessonsUntil || raw.videosUntil);

  const access: PlanAccess = isStudyPlan
    ? { lessonVideos: true, trafficRules: true, exams: true }
    : { lessonVideos: false, trafficRules: false, exams: true };

  const rawDays = Number(raw.durationDays ?? raw.validityDays);
  const durationDays = isStudyPlan
    ? (Number.isFinite(rawDays) && rawDays >= 1 ? Math.floor(rawDays) : 1)
    : 0;

  const rawLimit = raw.examLimit ?? raw.examsAllowed ?? raw.examCredits;
  const parsedLimit = Number(rawLimit);
  const examLimit = isStudyPlan
    ? null
    : (Number.isFinite(parsedLimit) && parsedLimit >= 1 ? Math.floor(parsedLimit) : 5);

  const rawEnd = raw.endDate || raw.expiresAt || null;
  const normalizedEndDate = isStudyPlan
    ? (rawEnd && typeof rawEnd.toDate === 'function' ? rawEnd.toDate().toISOString() : rawEnd)
    : null;

  return {
    id,
    userId: raw.userId || '',
    planId: raw.planId || '',
    planName: raw.planName || 'Standard Pass',
    price: typeof raw.price === 'number' ? raw.price : 0,
    durationDays,
    startDate: raw.startDate && typeof raw.startDate.toDate === 'function'
      ? raw.startDate.toDate().toISOString()
      : (raw.startDate || new Date().toISOString()),
    endDate: normalizedEndDate,
    access,
    examLimit,
    examsUsed: typeof raw.examsUsed === 'number' ? raw.examsUsed : 0,
    status: raw.status || 'active',
    source: raw.source || 'payment',
    grantedBy: raw.grantedBy || null,
  };
}

/**
 * Evaluates access enforcement by combining all active, unexpired subscriptions:
 * - No active subscription: free preview only (all features locked).
 * - Any active plan combined with lessons: grants lessons, videos, and unlimited exams until endDate.
 * - Exam-only plan: grants finite exam credits with no time expiration; ends when remaining count reaches 0.
 */
export function getCombinedAccess(subscriptions: Subscription[]): CombinedAccess {
  const now = new Date();

  const activeSubs = subscriptions.filter(sub => {
    const status = String(sub.status || 'active').toLowerCase();
    if (status !== 'active' && status !== 'approved' && status !== 'success') return false;
    const isStudy = Boolean(sub.access?.lessonVideos || sub.access?.trafficRules);
    if (!isStudy) {
      const allowed = typeof sub.examLimit === 'number' ? sub.examLimit : 5;
      const used = sub.examsUsed || 0;
      return (allowed - used) > 0;
    }
    if (!sub.endDate) return true;
    const end = new Date(sub.endDate);
    return !isNaN(end.getTime()) && end > now;
  });

  if (activeSubs.length === 0) {
    return {
      hasActiveSubscription: false,
      lessonVideos: false,
      trafficRules: false,
      exams: false,
      isUnlimitedExams: false,
      totalExamsAllowed: 0,
      examsUsed: 0,
      examsRemaining: 0,
      activeSubscriptionId: null,
      activePlanName: null,
      earliestExpiryDate: null,
      latestExpiryDate: null,
      activeSubscriptions: [],
    };
  }

  const hasStudy = activeSubs.some(s => Boolean(s.access?.lessonVideos || s.access?.trafficRules));
  const lessonVideos = hasStudy;
  const trafficRules = hasStudy;
  const exams = hasStudy || activeSubs.some(s => s.access?.exams === true);

  const examSubs = activeSubs.filter(s => Boolean(s.access?.lessonVideos || s.access?.trafficRules || s.access?.exams));

  let isUnlimitedExams = false;
  let totalExamsAllowed: number | null = null;
  let examsUsed = 0;
  let examsRemaining: number | null = 0;
  let activeSubscriptionId: string | null = null;
  let activePlanName: string | Record<Language, string> | null = activeSubs[0]?.planName || null;

  if (exams && examSubs.length > 0) {
    const studyExamSub = examSubs.find(s => Boolean(s.access?.lessonVideos || s.access?.trafficRules));
    const unlimitedSub = examSubs.find(s => s.examLimit === null || s.examLimit === undefined);

    if (studyExamSub || unlimitedSub) {
      const best = studyExamSub || unlimitedSub!;
      isUnlimitedExams = true;
      totalExamsAllowed = null;
      examsUsed = best.examsUsed || 0;
      examsRemaining = null;
      activeSubscriptionId = best.id;
      activePlanName = best.planName;
    } else {
      let sumAllowed = 0;
      let sumUsed = 0;
      let sumRemaining = 0;
      let primarySub = examSubs[0];

      for (const sub of examSubs) {
        const allowed = typeof sub.examLimit === 'number' ? sub.examLimit : 0;
        const used = sub.examsUsed || 0;
        const rem = Math.max(0, allowed - used);
        if (rem > 0) {
          sumAllowed += allowed;
          sumUsed += used;
          sumRemaining += rem;
          if ((primarySub.examLimit || 0) - (primarySub.examsUsed || 0) <= 0) {
            primarySub = sub;
          }
        }
      }

      isUnlimitedExams = false;
      totalExamsAllowed = sumAllowed;
      examsUsed = sumUsed;
      examsRemaining = sumRemaining;
      activeSubscriptionId = primarySub.id;
      activePlanName = primarySub.planName;
    }
  } else if (activeSubs.length > 0) {
    activeSubscriptionId = activeSubs[0].id;
    activePlanName = activeSubs[0].planName;
  }

  const sortedDates = activeSubs
    .filter(s => Boolean(s.access?.lessonVideos || s.access?.trafficRules) && s.endDate)
    .map(s => new Date(s.endDate!).getTime())
    .filter(t => !isNaN(t))
    .sort((a, b) => a - b);

  const earliestExpiryDate = sortedDates.length > 0 ? new Date(sortedDates[0]).toISOString() : null;
  const latestExpiryDate = sortedDates.length > 0 ? new Date(sortedDates[sortedDates.length - 1]).toISOString() : null;

  return {
    hasActiveSubscription: true,
    lessonVideos,
    trafficRules,
    exams,
    isUnlimitedExams,
    totalExamsAllowed,
    examsUsed,
    examsRemaining,
    activeSubscriptionId,
    activePlanName,
    earliestExpiryDate,
    latestExpiryDate,
    activeSubscriptions: activeSubs,
  };
}
