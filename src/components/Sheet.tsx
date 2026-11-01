import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';

type Props = {
  title: string;
  onClose: () => void;
  onBack?: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
};

// Нижняя панель поверх экрана. Закрывается крестиком, касанием затемнения или клавишей Esc.
export function Sheet({ title, onClose, onBack, children, footer }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);

  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-head">
          {onBack ? (
            <button type="button" class="icon-btn" onClick={onBack} aria-label="Назад">
              ‹
            </button>
          ) : (
            <span class="icon-btn-placeholder" />
          )}
          <h2>{title}</h2>
          <button type="button" class="icon-btn" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div class="sheet-body">{children}</div>
        {footer && <div class="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
