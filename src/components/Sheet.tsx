import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { Icon } from './Icon';

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
            <button type="button" class="icon-btn round" onClick={onBack} aria-label="Назад">
              <Icon name="back" size={20} />
            </button>
          ) : (
            <span class="icon-btn-placeholder" />
          )}
          <h2>{title}</h2>
          <button type="button" class="icon-btn round" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div class="sheet-body">{children}</div>
        {footer && <div class="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
