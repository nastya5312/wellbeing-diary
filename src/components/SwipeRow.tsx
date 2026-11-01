import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';

const ACTION_W = 96; // ширина кнопки «Удалить»

// Строка списка: свайп влево открывает «Удалить», касание — правка.
export function SwipeRow({ children, onTap, onDelete, label }: {
  children: ComponentChildren;
  onTap: () => void;
  onDelete: () => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  // Текущее смещение хранится и в ref: обработчик touchend должен видеть свежее значение, а не значение прошлой отрисовки
  const dragRef = useRef<number | null>(null);
  const setDragBoth = (v: number | null) => {
    dragRef.current = v;
    setDrag(v);
  };

  const base = open ? -ACTION_W : 0;
  const offset = drag ?? base;

  return (
    <div class="swipe">
      <button type="button" class="swipe-action" tabIndex={open ? 0 : -1} onClick={onDelete}>
        Удалить
      </button>
      <div
        class="swipe-content"
        style={{ transform: `translateX(${offset}px)`, transition: drag === null ? 'transform .2s' : 'none' }}
        onTouchStart={(e) => {
          const t = e.touches[0]!;
          start.current = { x: t.clientX, y: t.clientY };
          moved.current = false;
        }}
        onTouchMove={(e) => {
          if (!start.current) return;
          const t = e.touches[0]!;
          const dx = t.clientX - start.current.x;
          const dy = t.clientY - start.current.y;
          // Вертикальная прокрутка — не свайп
          if (!moved.current && Math.abs(dy) > Math.abs(dx)) {
            start.current = null;
            return;
          }
          if (Math.abs(dx) > 8) moved.current = true;
          if (moved.current) setDragBoth(Math.max(-ACTION_W * 1.3, Math.min(0, base + dx)));
        }}
        onTouchEnd={() => {
          const d = dragRef.current;
          if (moved.current && d !== null) setOpen(d < -ACTION_W / 2);
          setDragBoth(null);
          start.current = null;
        }}
      >
        <button
          type="button"
          class="swipe-main"
          aria-label={label}
          onClick={() => {
            if (moved.current) return;
            if (open) setOpen(false);
            else onTap();
          }}
        >
          {children}
        </button>
      </div>
    </div>
  );
}
