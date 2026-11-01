import { useState } from 'preact/hooks';
import type { Measurement, Metric } from '../models/types';
import { Icon } from '../components/Icon';
import { getDb } from '../db/schema';
import {
  addMeasurement, addMetric, deleteMeasurement, deleteMetric, listMeasurements, listMetrics, parseNumberRu,
  updateMeasurement, updateMetric,
} from '../db/courses';
import { METRIC_SUGGESTIONS } from '../db/defaults';
import { Sheet } from '../components/Sheet';
import { LineChart } from '../components/LineChart';
import { useLive } from '../lib/useLive';
import { safe, notify } from '../lib/notify';
import { formatDateRu, localDate } from '../lib/dates';

const num = (v: number) => String(v).replace('.', ',');

/** Положение значения относительно нормы, которую ввела сама пользовательница. Без оценок. */
function rangeNote(m: Metric, v: number): string {
  if (m.refLow !== undefined && v < m.refLow) return 'ниже указанной нормы';
  if (m.refHigh !== undefined && v > m.refHigh) return 'выше указанной нормы';
  return '';
}

// Анализы и показатели: значения во времени и график.
export function Metrics({ onBack }: { onBack: () => void }) {
  const db = getDb();
  const metrics = useLive(() => listMetrics(db, true), []);
  const lastValues = useLive(async () => {
    const all = await db.measurements.toArray();
    const map = new Map<string, Measurement>();
    for (const m of all) {
      const cur = map.get(m.metricId);
      if (!cur || m.date > cur.date || (m.date === cur.date && m.ts > cur.ts)) map.set(m.metricId, m);
    }
    return map;
  }, []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const opened = metrics?.find((m) => m.id === openId);
  if (opened) return <MetricDetail metric={opened} onBack={() => setOpenId(null)} />;

  const active = (metrics ?? []).filter((m) => !m.archived);
  const archived = (metrics ?? []).filter((m) => m.archived);

  return (
    <div class="screen">
      <header class="screen-head row center">
        <button type="button" class="icon-btn round" onClick={onBack} aria-label="Назад">
          <Icon name="back" size={20} />
        </button>
        <h1>Анализы и показатели</h1>
      </header>
      <p class="muted small">Результаты анализов и измерения с датами. Норму можно указать с бланка своей лаборатории.</p>
      <button type="button" class="btn btn-block" onClick={() => setCreating(true)}>
        + Новый показатель
      </button>
      <ul class="list">
        {[...active, ...archived].map((m) => {
          const last = lastValues?.get(m.id);
          return (
            <li key={m.id}>
              <button type="button" class="list-btn" onClick={() => setOpenId(m.id)}>
                <span>
                  {m.name}
                  {m.archived ? ' (архив)' : ''}
                </span>
                <span class="muted small">
                  {last
                    ? `${num(last.value)} ${m.unit} · ${formatDateRu(last.date)}${rangeNote(m, last.value) ? ` · ${rangeNote(m, last.value)}` : ''}`
                    : 'значений пока нет'}
                </span>
              </button>
            </li>
          );
        })}
        {metrics && metrics.length === 0 && <li class="muted empty">Пока пусто.</li>}
      </ul>
      {creating && <MetricForm onClose={() => setCreating(false)} />}
    </div>
  );
}

function MetricForm({ metric, onClose }: { metric?: Metric; onClose: () => void }) {
  const db = getDb();
  const [name, setName] = useState(metric?.name ?? '');
  const [unit, setUnit] = useState(metric?.unit ?? '');
  const [low, setLow] = useState(metric?.refLow !== undefined ? num(metric.refLow) : '');
  const [high, setHigh] = useState(metric?.refHigh !== undefined ? num(metric.refHigh) : '');
  const [daily, setDaily] = useState(metric?.daily ?? false);

  const save = async () => {
    const refLow = low.trim() ? parseNumberRu(low) : undefined;
    const refHigh = high.trim() ? parseNumberRu(high) : undefined;
    if (refLow === null || refHigh === null) {
      notify('Норма должна быть числом, например 0,4', 'error');
      return;
    }
    const ok = await safe(async () => {
      if (metric) await updateMetric(db, metric.id, { name: name.trim(), unit: unit.trim(), refLow, refHigh, daily });
      else {
        const m = await addMetric(db, { name, unit, refLow, refHigh });
        if (daily) await updateMetric(db, m.id, { daily: true });
      }
      return true;
    });
    if (ok) onClose();
  };

  return (
    <Sheet
      title={metric ? 'Показатель' : 'Новый показатель'}
      onClose={onClose}
      footer={
        <button type="button" class="btn btn-primary btn-block" disabled={!name.trim()} onClick={save}>
          Сохранить
        </button>
      }
    >
      <div class="form">
        {!metric && (
          <div class="chips">
            {METRIC_SUGGESTIONS.map((s) => (
              <button type="button" key={s.name} class="chip" onClick={() => (setName(s.name), setUnit(s.unit))}>
                {s.name}
              </button>
            ))}
          </div>
        )}
        <label class="field">
          <span>Название</span>
          <input type="text" value={name} maxLength={60} onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>Единица</span>
          <input type="text" value={unit} maxLength={20} placeholder="например, мМЕ/л" onInput={(e) => setUnit(e.currentTarget.value)} />
        </label>
        <div class="row">
          <label class="field grow">
            <span>Норма от</span>
            <input type="text" inputMode="decimal" value={low} onInput={(e) => setLow(e.currentTarget.value)} />
          </label>
          <label class="field grow">
            <span>до</span>
            <input type="text" inputMode="decimal" value={high} onInput={(e) => setHigh(e.currentTarget.value)} />
          </label>
        </div>
        <p class="muted small">Норма необязательна. Нормы разных лабораторий отличаются — бери с бланка.</p>
        <label class="check">
          <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.currentTarget.checked)} />
          <span>Вводить каждый день на экране «Сегодня»</span>
        </label>
      </div>
    </Sheet>
  );
}

function MetricDetail({ metric, onBack }: { metric: Metric; onBack: () => void }) {
  const db = getDb();
  const values = useLive(() => listMeasurements(db, metric.id), [metric.id]);
  const [edit, setEdit] = useState<Measurement | 'new' | null>(null);
  const [editingMetric, setEditingMetric] = useState(false);

  return (
    <div class="screen">
      <header class="screen-head row center">
        <button type="button" class="icon-btn round" onClick={onBack} aria-label="Назад">
          <Icon name="back" size={20} />
        </button>
        <h1 class="grow">{metric.name}</h1>
        <button type="button" class="btn btn-small" onClick={() => setEditingMetric(true)}>
          Изменить
        </button>
      </header>
      <p class="muted small">
        {metric.unit}
        {(metric.refLow !== undefined || metric.refHigh !== undefined) &&
          ` · норма ${metric.refLow !== undefined ? num(metric.refLow) : '…'}–${metric.refHigh !== undefined ? num(metric.refHigh) : '…'}`}
      </p>
      {values && values.length > 0 && (
        <LineChart
          label={metric.name}
          unit={metric.unit}
          points={values.map((v) => ({ date: v.date, value: v.value }))}
          refLow={metric.refLow}
          refHigh={metric.refHigh}
        />
      )}
      <button type="button" class="btn btn-primary btn-block" onClick={() => setEdit('new')}>
        + Добавить значение
      </button>
      <ul class="list">
        {[...(values ?? [])].reverse().map((v) => (
          <li key={v.id}>
            <button type="button" class="list-btn" onClick={() => setEdit(v)}>
              <span>
                {num(v.value)} {metric.unit}
                {rangeNote(metric, v.value) && <span class="muted small"> · {rangeNote(metric, v.value)}</span>}
              </span>
              <span class="muted small">
                {formatDateRu(v.date)}
                {v.note ? ` · ${v.note}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div class="stack">
        <button
          type="button"
          class="btn btn-block"
          onClick={() => void safe(() => updateMetric(db, metric.id, { archived: !metric.archived }))}
        >
          {metric.archived ? 'Вернуть из архива' : 'В архив'}
        </button>
        {values && values.length === 0 && (
          <button
            type="button"
            class="btn btn-danger btn-block"
            onClick={() => confirm(`Удалить «${metric.name}»?`) && void safe(() => deleteMetric(db, metric.id)).then(onBack)}
          >
            Удалить показатель
          </button>
        )}
      </div>
      {edit && <MeasurementForm metric={metric} value={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {editingMetric && <MetricForm metric={metric} onClose={() => setEditingMetric(false)} />}
    </div>
  );
}

function MeasurementForm({ metric, value, onClose }: { metric: Metric; value?: Measurement; onClose: () => void }) {
  const db = getDb();
  const [date, setDate] = useState(value?.date ?? localDate(new Date()));
  const [text, setText] = useState(value ? num(value.value) : '');
  const [note, setNote] = useState(value?.note ?? '');

  const save = async () => {
    const v = parseNumberRu(text);
    if (v === null) {
      notify('Введи число, например 2,35', 'error');
      return;
    }
    const ok = await safe(async () => {
      if (value) await updateMeasurement(db, value.id, { date, value: v, note: note.trim() || undefined });
      else await addMeasurement(db, { metricId: metric.id, date, value: v, note });
      return true;
    });
    if (ok) {
      notify('Сохранено');
      onClose();
    }
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
        <div class="row">
          <label class="field grow">
            <span>Значение, {metric.unit || 'ед.'}</span>
            <input type="text" inputMode="decimal" value={text} onInput={(e) => setText(e.currentTarget.value)} />
          </label>
          <label class="field grow">
            <span>Дата</span>
            <input type="date" value={date} onInput={(e) => e.currentTarget.value && setDate(e.currentTarget.value)} />
          </label>
        </div>
        <label class="field">
          <span>Заметка</span>
          <input type="text" value={note} maxLength={200} placeholder="например, лаборатория, натощак" onInput={(e) => setNote(e.currentTarget.value)} />
        </label>
        {value && (
          <button
            type="button"
            class="btn btn-danger btn-block"
            onClick={() => void safe(async () => (await deleteMeasurement(db, value.id), true)).then((ok) => ok && onClose())}
          >
            Удалить значение
          </button>
        )}
      </div>
    </Sheet>
  );
}
