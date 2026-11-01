import { useState } from 'preact/hooks';
import type { Measurement, Metric } from '../models/types';
import { getDb } from '../db/schema';
import { enableDailyMetric, listDailyMetrics, listMeasurementsByDate, parseNumberRu, setDailyValue, updateMetric } from '../db/courses';
import { DAILY_METRIC_SUGGESTIONS } from '../db/defaults';
import { Sheet } from './Sheet';
import { Icon, IconBadge } from './Icon';
import { useLive } from '../lib/useLive';
import { notify, safe } from '../lib/notify';

const num = (v: number) => String(v).replace('.', ',');

// Ежедневные измерения на экране дня: вес, пульс, давление… Одно значение в день.
export function DailyMetrics({ date }: { date: string }) {
  const db = getDb();
  const metrics = useLive(() => listDailyMetrics(db), []);
  const values = useLive(async () => {
    const map = new Map<string, Measurement>();
    for (const m of await listMeasurementsByDate(db, date)) map.set(m.metricId, m);
    return map;
  }, [date]);
  const [editing, setEditing] = useState<Metric | null>(null);
  const [choosing, setChoosing] = useState(false);

  if (!metrics || !values) return null;

  return (
    <section class="screen" style={{ gap: '16px' }}>
      <h2 class="section-title">Измерения</h2>
      <div class="group">
        {metrics.map((m) => {
          const v = values.get(m.id);
          return (
            <button type="button" key={m.id} class="row-btn" onClick={() => setEditing(m)}>
              <IconBadge name="metric" tone="metric" size={30} />
              <span class="row-main">
                <span class="row-title">{m.name}</span>
              </span>
              {v ? (
                <span class="row-value">
                  {num(v.value)} <span class="muted small">{m.unit}</span>
                </span>
              ) : (
                <span class="row-value empty">Внести</span>
              )}
              <Icon name="chevron" size={16} class="chev" />
            </button>
          );
        })}
        <button type="button" class="row-btn" onClick={() => setChoosing(true)}>
          <IconBadge name="plus" tone="accent" size={30} />
          <span class="row-main">
            <span class="row-title" style={{ color: 'var(--accent)' }}>
              {metrics.length ? 'Изменить список измерений' : 'Вес, пульс и другие измерения'}
            </span>
            {!metrics.length && <span class="row-sub">Выбери, что вносить каждый день</span>}
          </span>
        </button>
      </div>
      {editing && (
        <ValueSheet metric={editing} date={date} current={values.get(editing.id)} onClose={() => setEditing(null)} />
      )}
      {choosing && <ChooseSheet daily={metrics} onClose={() => setChoosing(false)} />}
    </section>
  );
}

function ValueSheet({ metric, date, current, onClose }: { metric: Metric; date: string; current?: Measurement; onClose: () => void }) {
  const db = getDb();
  const [text, setText] = useState(current ? num(current.value) : '');
  const save = async () => {
    const v = parseNumberRu(text);
    if (v === null) {
      notify('Введи число, например 58,4', 'error');
      return;
    }
    if ((await safe(async () => (await setDailyValue(db, metric.id, date, v), true))) === true) onClose();
  };
  return (
    <Sheet
      title={metric.name}
      onClose={onClose}
      footer={
        <button type="button" class="btn btn-primary btn-block" disabled={!text.trim()} onClick={save}>
          Сохранить
        </button>
      }
    >
      <div class="form">
        <label class="field">
          <span>Значение, {metric.unit || 'ед.'}</span>
          <input
            type="text"
            inputMode="decimal"
            value={text}
            autoFocus
            onInput={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
          />
        </label>
        <p class="muted small">Одно значение на день. График и все значения: «Ещё» → «Анализы и показатели».</p>
        {current && (
          <button
            type="button"
            class="btn btn-danger btn-block"
            onClick={() => void safe(async () => (await setDailyValue(db, metric.id, date, null), true)).then((ok) => ok && onClose())}
          >
            Удалить значение за этот день
          </button>
        )}
      </div>
    </Sheet>
  );
}

function ChooseSheet({ daily, onClose }: { daily: Metric[]; onClose: () => void }) {
  const db = getDb();
  const isOn = (name: string) => daily.find((m) => m.name.trim().toLowerCase() === name.toLowerCase());
  const toggle = (name: string, unit: string) => {
    const on = isOn(name);
    void safe(async () => {
      if (on) await updateMetric(db, on.id, { daily: false });
      else await enableDailyMetric(db, name, unit);
    });
  };
  const custom = daily.filter((m) => !DAILY_METRIC_SUGGESTIONS.some((s) => s.name.toLowerCase() === m.name.trim().toLowerCase()));
  return (
    <Sheet
      title="Ежедневные измерения"
      onClose={onClose}
      footer={
        <button type="button" class="btn btn-primary btn-block" onClick={onClose}>
          Готово
        </button>
      }
    >
      <div class="form">
        <p class="muted small">Отмеченные появятся на экране «Сегодня». Снятие отметки ничего не удаляет — значения сохраняются.</p>
        {DAILY_METRIC_SUGGESTIONS.map((s) => (
          <label class="check" key={s.name}>
            <input type="checkbox" checked={!!isOn(s.name)} onChange={() => toggle(s.name, s.unit)} />
            <span>
              {s.name} <span class="muted small">({s.unit})</span>
            </span>
          </label>
        ))}
        {custom.map((m) => (
          <label class="check" key={m.id}>
            <input type="checkbox" checked onChange={() => void safe(() => updateMetric(db, m.id, { daily: false }))} />
            <span>
              {m.name} <span class="muted small">({m.unit})</span>
            </span>
          </label>
        ))}
        <p class="muted small">
          Свой показатель: «Ещё» → «Анализы и показатели» → «+ Новый показатель», галочка «Вводить каждый день».
        </p>
      </div>
    </Sheet>
  );
}
