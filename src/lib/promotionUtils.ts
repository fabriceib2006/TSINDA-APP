import { Promotion } from '../types';
import { getKigaliNow } from './timeUtils';

export function getBestPromotion(planId: string, basePrice: number, promotions: Promotion[]): {
  hasPromotion: boolean;
  activePromo: Promotion | null;
  originalPrice: number;
  discountedPrice: number;
  discountAmount: number;
  discountBadge: string;
} {
  const now = getKigaliNow().getTime();
  let bestPrice = basePrice;
  let activePromo: Promotion | null = null;
  let discountAmount = 0;
  let discountBadge = '';

  promotions.forEach(p => {
    if (!p.isActive) return;
    if (p.planId !== 'all' && p.planId !== planId) return;
    const start = new Date(p.startAt).getTime();
    const end = new Date(p.endAt).getTime();
    if (now >= start && now <= end) {
      let candPrice = basePrice;
      let candDiscount = 0;
      if (p.discountType === 'percent') {
        candDiscount = Math.round(basePrice * (Number(p.discountValue) / 100));
        discountBadge = `-${p.discountValue}%`;
      } else {
        candDiscount = Number(p.discountValue);
        discountBadge = `-RWF ${candDiscount.toLocaleString()}`;
      }
      candPrice = Math.max(100, basePrice - candDiscount);
      if (candPrice < bestPrice) {
        bestPrice = candPrice;
        activePromo = p;
        discountAmount = basePrice - bestPrice;
      }
    }
  });

  return {
    hasPromotion: activePromo !== null,
    activePromo,
    originalPrice: basePrice,
    discountedPrice: bestPrice,
    discountAmount,
    discountBadge
  };
}
