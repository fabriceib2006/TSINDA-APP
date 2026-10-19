export const normalizePhone = (input: string | null | undefined): string | null => {
  if (!input) return null;
  // Remove spaces, dashes, dots, brackets and parentheses
  let cleaned = input.replace(/[\s\-\.\(\)\[\]]/g, '');

  // Handle leading '+' or '00'
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  } else if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }

  // If starts with 0, replace with 250
  if (cleaned.startsWith('0')) {
    cleaned = '250' + cleaned.substring(1);
  } else if (cleaned.startsWith('7') && cleaned.length === 9) {
    // If starts with 7 and is 9 digits, prefix with 250
    cleaned = '250' + cleaned;
  }

  // Validate: must be 250 followed by 9 digits = 12 digits total
  if (/^250\d{9}$/.test(cleaned)) {
    return cleaned;
  }

  return null;
};

// Backward compatibility alias
export const normalizeRwandanPhone = normalizePhone;

export const validatePhone = (input: string | null | undefined): boolean => {
  const normalized = normalizePhone(input);
  if (!normalized) return false;
  const digitsAfter250 = normalized.substring(3); // 9 digits
  const prefix = digitsAfter250.substring(0, 2);
  return prefix === '78' || prefix === '79' || prefix === '72' || prefix === '73';
};

export const isRwandanPhone = validatePhone;

export const detectNetwork = (input: string | null | undefined): 'MTN' | 'Airtel' | null => {
  if (!input) return null;
  const normalized = input.startsWith('250') && input.length === 12 ? input : normalizePhone(input);
  if (!normalized) return null;
  const prefix = normalized.substring(3, 5); // 2 digits after 250
  if (prefix === '78' || prefix === '79') {
    return 'MTN';
  }
  if (prefix === '72' || prefix === '73') {
    return 'Airtel';
  }
  return null;
};

export const phoneToEmail = (phone: string): string | null => {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return `${normalized}@students.tsinda.app`;
};
