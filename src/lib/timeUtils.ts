// Timezone and date utilities for Africa/Kigali (CAT, UTC+2)

export function getKigaliNow(): Date {
  // Returns current date adjusted to Africa/Kigali time representation
  const now = new Date();
  // Africa/Kigali is UTC+2 (no daylight saving)
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const kigaliTime = new Date(utc + (3600000 * 2));
  return kigaliTime;
}

export function parseKigaliInput(dateString: string): Date {
  // Parses a datetime-local input string (YYYY-MM-DDTHH:mm) as Africa/Kigali time
  if (!dateString) return new Date();
  const d = new Date(`${dateString}:00+02:00`);
  return isNaN(d.getTime()) ? new Date() : d;
}

export function formatKigaliDateTime(dateInput: string | Date | number): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';

  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Kigali',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    // e.g. "17/10/2026, 15:30" -> replace comma
    const formatted = formatter.format(d);
    return `${formatted.replace(',', '')} CAT`;
  } catch {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins} CAT`;
  }
}

export function getPromotionStatus(startAt: string, endAt: string, isActive: boolean): 'scheduled' | 'running' | 'ended' {
  if (!isActive) return 'ended';
  const now = getKigaliNow().getTime();
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();

  if (now < start) return 'scheduled';
  if (now >= start && now <= end) return 'running';
  return 'ended';
}

export function formatCountdown(endAt: string): string {
  const now = getKigaliNow().getTime();
  const end = new Date(endAt).getTime();
  const diff = end - now;

  if (diff <= 0) return 'Ended';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `ends in ${days}d ${hours}h`;
  if (hours > 0) return `ends in ${hours}h ${mins}m`;
  return `ends in ${mins}m`;
}
