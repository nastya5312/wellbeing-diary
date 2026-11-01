import { useEffect, useState } from 'preact/hooks';

// Разрешила ли система постоянное хранение и сколько места занято.
export function StorageStatus() {
  const [state, setState] = useState<{ persisted: boolean | null; usedMb: number | null }>({ persisted: null, usedMb: null });

  useEffect(() => {
    void (async () => {
      let persisted: boolean | null = null;
      let usedMb: number | null = null;
      try {
        if (navigator.storage?.persisted) persisted = await navigator.storage.persisted();
        if (!persisted && navigator.storage?.persist) persisted = await navigator.storage.persist();
        const est = await navigator.storage?.estimate?.();
        if (est?.usage !== undefined) usedMb = est.usage / 1024 / 1024;
      } catch {
        /* нет поддержки — покажем «неизвестно» */
      }
      setState({ persisted, usedMb });
    })();
  }, []);

  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

  return (
    <section class="panel small">
      <h2>Хранилище</h2>
      <p>
        Защита от автоочистки:{' '}
        {state.persisted === null ? 'неизвестно' : state.persisted ? 'включена системой ✓' : 'система не подтвердила'}
      </p>
      <p>Открыто как: {standalone ? 'приложение с экрана «Домой» ✓' : 'страница в браузере — вноси записи через иконку'}</p>
      {state.usedMb !== null && <p>Занято: {state.usedMb < 1 ? 'меньше 1' : state.usedMb.toFixed(1)} МБ</p>}
      <p class="muted">Даже при включённой защите копия в «Файлах» обязательна.</p>
    </section>
  );
}
