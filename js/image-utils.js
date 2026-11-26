export async function compressImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('אפשר להעלות רק jpg, png או webp');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('קובץ התמונה גדול מדי');
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (_) {
    bitmap = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('לא ניתן לקרוא את התמונה')); };
      image.src = url;
    });
  }

  const sourceWidth = bitmap.width || bitmap.naturalWidth;
  const sourceHeight = bitmap.height || bitmap.naturalHeight;
  if (!sourceWidth || !sourceHeight) {
    bitmap.close?.();
    throw new Error('לא ניתן לקרוא את התמונה');
  }

  const targetLimit = 500 * 1024;
  let scale = Math.min(1, 1000 / Math.max(sourceWidth, sourceHeight));
  let quality = 0.82;

  try {
    while (scale >= 0.1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('דחיסת התמונה אינה נתמכת בדפדפן הזה');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (let attempt = 0; attempt < 5; attempt++) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length <= targetLimit) return dataUrl;
        quality -= 0.12;
      }

      quality = 0.82;
      scale *= 0.8;
    }

    throw new Error('התמונה לא ניתנת לדחיסה מתחת למגבלה. נסי תמונה קטנה יותר');
  } finally {
    bitmap.close?.();
  }
}
