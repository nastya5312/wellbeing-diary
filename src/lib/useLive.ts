import { useEffect, useState } from 'preact/hooks';
import { liveQuery } from 'dexie';
import { notify } from './notify';
import { storageErrorMessage } from './storage';

/**
 * Живой запрос к базе: экран сам обновляется после любой записи (Dexie liveQuery).
 * Пока данные не загружены, возвращает undefined.
 */
export function useLive<T>(query: () => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<{ v: T } | undefined>(undefined);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: (v) => setValue({ v }),
      error: (e: unknown) => notify(storageErrorMessage(e), 'error'),
    });
    return () => sub.unsubscribe();
  }, deps);
  return value?.v;
}
