/**
 * Helper to compress and resize image files before storing in Firestore
 * to prevent exceeding Firestore's 1MB document size limit.
 */
export function compressImage(file: File, maxWidth = 900, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context failed'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        // If still over 950KB, compress more aggressively
        if (dataUrl.length > 950000) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.5);
        }
        if (dataUrl.length > 950000) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.3);
        }
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
