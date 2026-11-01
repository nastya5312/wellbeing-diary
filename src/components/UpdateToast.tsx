import { useRegisterSW } from 'virtual:pwa-register/preact';

// Тост «Доступна новая версия». Service worker не обновляется сам:
// новая версия включается только по нажатию «Обновить». Данные в IndexedDB при этом не трогаются.
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div class="toast" role="status" aria-live="polite">
      <span>Доступна новая версия.</span>
      <div class="toast-actions">
        <button type="button" class="btn btn-primary" onClick={() => updateServiceWorker(true)}>
          Обновить
        </button>
        <button type="button" class="btn" onClick={() => setNeedRefresh(false)}>
          Позже
        </button>
      </div>
    </div>
  );
}
