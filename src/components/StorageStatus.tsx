import { Icon, IconBadge } from './Icon';
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

  const ok = state.persisted === true && standalone;
  return (
    <details class="group storage">
      <summary class="row-btn">
        <IconBadge name="shield" tone={ok ? 'med' : 'warn'} size={34} />
        <span class="row-main">
          <span class="row-title">Хранилище</span>
          <span class="row-sub">
            {ok ? 'Данные защищены от автоочистки' : 'Проверь, как открыто приложение'}
            {state.usedMb !== null && `, занято ${state.usedMb < 1 ? 'меньше 1' : state.usedMb.toFixed(1)} МБ`}
          </span>
        </span>
        <Icon name="chevron" size={16} class="chev" />
      </summary>
      <div class="storage-body small">
        <p>
          Защита от автоочистки:{' '}
          {state.persisted === null ? 'неизвестно' : state.persisted ? 'включена системой' : 'система не подтвердила'}
        </p>
        <p>Открыто как: {standalone ? 'приложение с экрана «Домой»' : 'страница в браузере — вноси записи через иконку на экране «Домой»'}</p>
        <p class="muted">Даже при включённой защите храни копию в «Файлах».</p>
      </div>
    </details>
  );
}
