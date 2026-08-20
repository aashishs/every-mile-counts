export function canShareFiles(file) {
  try {
    return Boolean(
      typeof navigator !== 'undefined'
      && typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [file] })
    );
  } catch {
    return false;
  }
}

export function canShareText() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export function downloadBlob(blob, filename) {
  if (typeof document === 'undefined') {
    throw new Error('Download is not available');
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function shareOrDownload({ blob, filename, title, text }) {
  if (!blob) throw new Error('Poster image is missing');
  const type = blob.type || 'image/png';
  const file = typeof File === 'function'
    ? new File([blob], filename, { type })
    : blob;

  if (canShareFiles(file)) {
    try {
      await navigator.share({
        files: [file],
        title: title || 'Every Mile Counts',
        text: text || '',
      });
      return { method: 'share' };
    } catch (err) {
      if (err?.name === 'AbortError') return { method: 'cancelled' };
    }
  }

  downloadBlob(blob, filename);
  return { method: 'download' };
}
