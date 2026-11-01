import { dismiss, useNotices } from '../lib/notify';

export function Notices() {
  const list = useNotices();
  if (!list.length) return null;
  return (
    <div class="notices" aria-live="assertive">
      {list.map((n) => (
        <div key={n.id} class={`notice notice-${n.kind}`} role={n.kind === 'error' ? 'alert' : 'status'}>
          <span>{n.text}</span>
          {n.action && (
            <button
              type="button"
              class="notice-action"
              onClick={() => {
                n.action!.run();
                dismiss(n.id);
              }}
            >
              {n.action.label}
            </button>
          )}
          <button type="button" class="icon-btn" aria-label="Закрыть" onClick={() => dismiss(n.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
