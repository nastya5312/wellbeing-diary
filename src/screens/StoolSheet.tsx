import { useEffect, useState } from 'preact/hooks';
import type { Stool } from '../models/types';
import { getDb } from '../db/schema';
import { getDay, saveDay } from '../db/repo';
import { Sheet } from '../components/Sheet';
import { safe, notify } from '../lib/notify';
import { formatDateLong } from '../lib/dates';
import { BRISTOL_LABELS } from '../lib/labels';

const COUNTS = [0, 1, 2, 3, 4, 5];

// Стул за день: сколько раз и форма по Бристольской шкале.
export function StoolSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const [count, setCount] = useState<number | null>(null);
  const [type, setType] = useState<Stool['type']>(undefined);
  const [had, setHad] = useState(false);

  useEffect(() => {
    void safe(() => getDay(getDb(), date)).then((d) => {
      if (d?.stool) {
        setCount(d.stool.count);
        setType(d.stool.type);
        setHad(true);
      }
    });
  }, [date]);

  const save = async (stool: Stool | undefined) => {
    const ok = await safe(async () => (await saveDay(getDb(), date, { stool }), true));
    if (ok) {
      notify(stool ? 'Сохранено' : 'Удалено');
      onClose();
    }
  };

  return (
    <Sheet
      title={`Стул · ${formatDateLong(date)}`}
      onClose={onClose}
      footer={
        <button
          type="button"
          class="btn btn-primary btn-block"
          disabled={count === null}
          onClick={() => count !== null && void save({ count, ...(count > 0 && type && { type }) })}
        >
          Сохранить
        </button>
      }
    >
      <div class="form">
        <div class="field">
          <span>Сколько раз за день</span>
          <div class="chips" role="radiogroup">
            {COUNTS.map((n) => (
              <button
                type="button"
                key={n}
                role="radio"
                aria-checked={count === n}
                class={`chip${count === n ? ' active' : ''}`}
                onClick={() => setCount(n)}
              >
                {n === 0 ? 'не было' : n === 5 ? '5+' : n}
              </button>
            ))}
          </div>
        </div>
        {count !== null && count > 0 && (
          <div class="field">
            <span>Форма (Бристольская шкала)</span>
            <div class="bristol" role="radiogroup">
              {BRISTOL_LABELS.map((label, i) => {
                const v = (i + 1) as NonNullable<Stool['type']>;
                return (
                  <button
                    type="button"
                    key={v}
                    role="radio"
                    aria-checked={type === v}
                    class={`btn bristol-btn${type === v ? ' active' : ''}`}
                    onClick={() => setType(type === v ? undefined : v)}
                  >
                    <b>{v}</b> {label}
                  </button>
                );
              })}
            </div>
            <p class="muted small">Если было по-разному — выбери самый непривычный за день. Можно не указывать.</p>
          </div>
        )}
        {had && (
          <button type="button" class="btn btn-danger btn-block" onClick={() => void save(undefined)}>
            Удалить запись за день
          </button>
        )}
      </div>
    </Sheet>
  );
}
