import { useState } from 'preact/hooks';
import { getDb } from '../db/schema';
import { addPeriod } from '../db/repo';
import { buildForecast, METHOD_LABEL, type Forecast } from '../lib/ovulation';
import { useLive } from '../lib/useLive';
import { notify, safe } from '../lib/notify';
import { addDays, daysBetween, formatDateRu, localDate } from '../lib/dates';
import { Sheet } from './Sheet';
import { Icon, IconBadge } from './Icon';

/** Прогноз цикла по всем записям (месячные, отметки овуляции, тесты на ЛГ, температура утром). */
export function useForecast(today: string): Forecast | undefined {
  const db = getDb();
  return useLive(async () => {
    const [days, metrics, measurements] = await Promise.all([db.days.toArray(), db.metrics.toArray(), db.measurements.toArray()]);
    const bbtIds = new Set(metrics.filter((m) => /температур/i.test(m.name)).map((m) => m.id));
    const bbt = measurements.filter((m) => bbtIds.has(m.metricId)).map((m) => ({ date: m.date, value: m.value }));
    return buildForecast({ flowDates: days.filter((d) => (d.flow ?? 0) > 0).map((d) => d.date), days, bbt, today });
  }, [today]);
}

const dm = (d: string) => formatDateRu(d).slice(0, 5);

// Блок «Цикл» под календарём: когда ждать месячных, овуляции по циклам, добавление прошлых месячных.
export function CyclePanel({ today }: { today: string }) {
  const f = useForecast(today);
  const [adding, setAdding] = useState(false);
  if (!f) return null;
  const recent = f.ovulations.filter((o) => !o.predicted || o.date <= today).slice(-4).reverse();
  const nextOv = f.ovulations.find((o) => o.predicted && o.date >= today);
  const lastStart = f.starts[f.starts.length - 1];
  const dayNo = lastStart ? daysBetween(lastStart, today) + 1 : null;

  return (
    <section class="panel">
      <h2 class="cycle-title">
        <IconBadge name="drop" tone="cycle" size={30} /> Цикл
      </h2>
      {!f.starts.length ? (
        <p class="muted">Месячных пока нет в записях. Отмечай их в «Самочувствии» или добавь прошлые.</p>
      ) : (
        <div class="cycle-lines">
          {dayNo !== null && dayNo <= 60 && <p>Сейчас день цикла {dayNo}.</p>}
          {f.nextStart ? (
            <p>
              Следующие месячные ожидаются около <b>{dm(f.nextStart.date)}</b>
              {f.nextStart.from !== f.nextStart.to && <span class="muted"> (в промежутке {dm(f.nextStart.from)}–{dm(f.nextStart.to)})</span>}.
            </p>
          ) : (
            <p class="muted">Для прогноза нужно хотя бы два начала месячных.</p>
          )}
          {nextOv && (
            <p>
              Овуляция по оценке около <b>{dm(nextOv.date)}</b>.
            </p>
          )}
          {f.medianLen && (
            <p class="muted small">
              Обычная длина цикла: {f.medianLen} дн. (по {f.lengths.length} циклам). Лютеиновая фаза: {f.lutealLen} дн.
              {f.lutealFromData ? ' (по твоим отметкам)' : ' (по умолчанию)'}
            </p>
          )}
        </div>
      )}
      {recent.length > 0 && (
        <div class="group">
          {recent.map((o) => (
            <div key={o.cycleStart + o.date} class="row-btn" style={{ cursor: 'default' }}>
              <span class="row-main">
                <span class="row-title">Овуляция {formatDateRu(o.date)}</span>
                <span class="row-sub">цикл с {formatDateRu(o.cycleStart)} · {METHOD_LABEL[o.method]}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      <p class="muted small">
        Это оценки по твоим записям, не медицинский результат и не способ предохранения. Точнее всего — отметка овуляции вручную,
        тест на ЛГ и температура утром.
      </p>
      <button type="button" class="btn btn-link" onClick={() => setAdding(true)}>
        <Icon name="plus" size={18} /> Добавить прошлые месячные
      </button>
      {adding && <AddPeriod onClose={() => setAdding(false)} />}
    </section>
  );
}

function AddPeriod({ onClose }: { onClose: () => void }) {
  const db = getDb();
  const [start, setStart] = useState(addDays(localDate(new Date()), -7));
  const [len, setLen] = useState(5);
  const save = async () => {
    const n = await safe(() => addPeriod(db, start, len));
    if (n !== undefined) {
      notify(n ? `Месячные добавлены: ${n} дн.` : 'Эти дни уже отмечены');
      onClose();
    }
  };
  return (
    <Sheet
      title="Прошлые месячные"
      onClose={onClose}
      footer={
        <button type="button" class="btn btn-primary btn-block" onClick={() => void save()}>
          Добавить
        </button>
      }
    >
      <div class="form">
        <label class="field">
          <span>Первый день</span>
          <input type="date" value={start} onInput={(e) => e.currentTarget.value && setStart(e.currentTarget.value)} />
        </label>
        <div class="field">
          <span>Сколько дней</span>
          <div class="chips">
            {[3, 4, 5, 6, 7, 8].map((n) => (
              <button type="button" key={n} class={`chip${len === n ? ' active' : ''}`} onClick={() => setLen(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <p class="muted small" style={{ margin: 0 }}>
          Дни отмечаются как «средние» месячные. Если день уже отмечен, он не меняется. Добавляй по одному циклу — чем больше циклов,
          тем точнее прогноз.
        </p>
      </div>
    </Sheet>
  );
}
