// Отдать файл пользовательнице: системное меню «Поделиться» (на iPhone — «Сохранить в Файлы»), иначе скачивание.

/** true — файл отдан (или скачан), false — пользовательница закрыла меню. */
export async function shareFile(blob: Blob, name: string, how: 'share' | 'download' = 'share'): Promise<boolean> {
  const file = new File([blob], name, { type: blob.type });
  if (how === 'share' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return false;
      // Другая ошибка — пробуем скачивание
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Несколько файлов одним меню «Поделиться», иначе — скачивание по одному. */
export async function shareFiles(files: { blob: Blob; name: string }[], how: 'share' | 'download' = 'share'): Promise<boolean> {
  const list = files.map((f) => new File([f.blob], f.name, { type: f.blob.type }));
  if (how === 'share' && navigator.canShare?.({ files: list })) {
    try {
      await navigator.share({ files: list });
      return true;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return false;
    }
  }
  for (const f of files) await shareFile(f.blob, f.name, 'download');
  return true;
}
