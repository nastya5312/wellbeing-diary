// Простые уведомления (ошибки и короткие сообщения) без сторонних библиотек.
import { useEffect, useState } from 'preact/hooks';
import { storageErrorMessage } from './storage';

export type Notice = { id: number; text: string; kind: 'error' | 'info' };

let notices: Notice[] = [];
let nextId = 1;
const listeners = new Set<(n: Notice[]) => void>();

function emit() {
  for (const l of listeners) l(notices);
}

export function notify(text: string, kind: Notice['kind'] = 'info') {
  const n = { id: nextId++, text, kind };
  // Информационное сообщение одно за раз (новое заменяет старое), ошибки не теряются
  notices = [...notices.filter((x) => x.kind === 'error'), n];
  emit();
  setTimeout(() => dismiss(n.id), kind === 'error' ? 8000 : 1800);
}

export function dismiss(id: number) {
  notices = notices.filter((n) => n.id !== id);
  emit();
}

/**
 * Обёртка для записи в базу из интерфейса: ошибки не теряются молча, а показываются по-русски.
 * Сообщения наших проверок (Error с русским текстом) показываются как есть.
 */
export async function safe<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    const own = e instanceof Error && e.name === 'Error' && /[а-яё]/i.test(e.message);
    notify(own ? (e as Error).message : storageErrorMessage(e), 'error');
    return undefined;
  }
}

export function useNotices(): Notice[] {
  const [list, setList] = useState(notices);
  useEffect(() => {
    listeners.add(setList);
    return () => void listeners.delete(setList);
  }, []);
  return list;
}
