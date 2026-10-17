
export const normalizeRwandanPhone = (phone: string): string | null => {
  // Remove spaces, dashes, parentheses
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');

  // Handle +250 prefix
  if (cleaned.startsWith('+250')) {
    cleaned = cleaned.substring(1);
  }

  // If starts with 0, replace with 250
  if (cleaned.startsWith('0')) {
    cleaned = '250' + cleaned.substring(1);
  }
  
  // If starts with 7, assume it's 7xxxxxxx and prefix with 250
  if (cleaned.length === 9 && cleaned.startsWith('7')) {
    cleaned = '250' + cleaned;
  }

  // Validate: must be 250 + 9 digits = 12 digits
  if (/^2507\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  return null;
};

export const detectNetwork = (phone: string): 'MTN' | 'Airtel' | null => {
  // Assuming phone is already normalized to 2507XXXXXXXX
  const prefix = phone.substring(3, 6); // Gets 7XX
  
  if (prefix === '78' || prefix === '79') {
    return 'MTN';
  }
  if (prefix === '72' || prefix === '73') {
    return 'Airtel';
  }
  
  return null;
};
