// Защита хранилища и понятные сообщения об ошибках.

/**
 * Просит браузер не удалять данные сайта автоматически (navigator.storage.persist).
 * Safari может отказать или промолчать — тогда остаётся защита резервными копиями.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Перевод ошибок IndexedDB/Dexie в понятный русский текст. */
export function storageErrorMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  switch (name) {
    case 'QuotaExceededError':
      return 'На телефоне не хватает места, запись не сохранилась. Освободи место и попробуй снова.';
    case 'MissingAPIError':
    case 'InvalidStateError':
      return 'Хранилище недоступно. Возможно, включён режим «Частный доступ» в Safari — в нём записи не сохраняются.';
    case 'VersionError':
      return 'Данные созданы более новой версией приложения. Обнови приложение.';
    default:
      return 'Не удалось сохранить или прочитать записи. Попробуй ещё раз; если повторяется — сделай экспорт и напиши разработчику.';
  }
}
