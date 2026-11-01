import { useState } from 'preact/hooks';
import type { Experiment } from '../models/types';
import { getDb } from '../db/schema';
import { getSettings, updateSettings } from '../db/repo';
import { compareExperiment, EXP, type ExpResult, type ExpRow } from '../analysis/experiment';
import { useLive } from '../lib/useLive';
import { notify, safe } from '../lib/notify';
import { addDays, daysBetween, formatDateRu } from '../lib/dates';
import { Sheet } from './Sheet';
import { Icon, IconBadge } from './Icon';

const LENGTHS = [7, 14, 21, 28];
const n1 = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');
const pct = (x: number) => `${Math.round(x * 100)}%`;

function rowText(r: ExpRow): string {
  const fmt = (s: ExpRow['before']) => (r.kind === 'rate' ? `${s.count} из ${s.n} дн. (${pct(s.value)})` : n1(s.value));
  const dir = r.direction === 'same' ? 'без изменений' : r.kind === 'rate' ? (r.direction === 'down' ? 'реже' : 'чаще') : r.direction === 'down' ? 'ниже' : 'выше';
  return `${fmt(r.before)} → ${fmt(r.during)}, ${dir}`;
}

function statusText(e: Experiment, r: ExpResult): string {
  if (r.status === 'planned') return `начнётся ${formatDateRu(e.start)}`;
  if (r.status === 'running') return `идёт: день ${r.dayNo} из ${r.totalDays}`;
  return `закончен ${formatDateRu(e.end)}`;
}

// «Мои эксперименты»: сравнение периода, который задаёт сама пользовательница, с таким же периодом до него.
export function Experiments({ today }: { today: string }) {
  const db = getDb();
  const data = useLive(async () => {
    const [days, events, items, metrics, measurements, settings] = await Promise.all([
      db.days.toArray(), db.events.toArray(), db.items.toArray(), db.metrics.toArray(), db.measurements.toArray(), getSettings(db),
    ]);
    const list = [...(settings.experiments ?? [])].sort((a, b) => b.start.localeCompare(a.start));
    const input = { days, events, items, metrics, measurements, settings };
    return list.map((e) => ({ e, r: compareExperiment(input, e, today) }));
  }, [today]);
  const [editing, setEditing] = useState<Experiment | 'new' | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const opened = data?.find((x) => x.e.id === open);

  return (
    <section class="why-card">
      <span class="card-title">
        <IconBadge name="sparkle" tone="mood" size={30} /> Мои эксперименты
      </span>
      <span class="muted small">
        Задай период — например, «две недели без молочного» — и сравни его с таким же периодом до начала.
      </span>
      {data && data.length > 0 && (
        <div class="group exp-list">
          {data.map(({ e, r }) => {
            const clear = r.rows.filter((x) => x.clear).length;
            return (
              <button type="button" key={e.id} class="row-btn" onClick={() => setOpen(e.id)}>
                <span class="row-main">
                  <span class="row-title">{e.name}</span>
                  <span class="row-sub">
                    {statusText(e, r)}
                    {r.status !== 'planned' && (r.enough ? `, устойчивых изменений: ${clear}` : ', пока мало данных')}
                  </span>
                </span>
                <Icon name="chevron" size={16} class="chev" />
              </button>
            );
          })}
        </div>
      )}
      <button type="button" class="btn btn-link" onClick={() => setEditing('new')}>
        <Icon name="plus" size={18} /> Новый эксперимент
      </button>

      {opened && (
        <ExperimentDetail
          e={opened.e}
          r={opened.r}
          onEdit={() => {
            setEditing(opened.e);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {editing && <ExperimentForm today={today} initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function ExperimentDetail({ e, r, onEdit, onClose }: { e: Experiment; r: ExpResult; onEdit: () => void; onClose: () => void }) {
  return (
    <Sheet title={e.name} onClose={onClose}>
      <div class="form" style={{ gap: '14px' }}>
        <p class="muted" style={{ margin: 0 }}>
          {formatDateRu(e.start)} — {formatDateRu(e.end)} · {statusText(e, r)}
        </p>
        {e.note && <p class="note small" style={{ margin: 0 }}>{e.note}</p>}
        {r.status === 'planned' ? (
          <p class="panel">Эксперимент ещё не начался. Отмечай дни как обычно — сравнение появится после начала.</p>
        ) : !r.enough ? (
          <p class="panel">
            Заполненных дней: до — {r.before.completed}, во время — {r.during.completed}. Для сравнения нужно хотя бы по {EXP.minDays} в
            каждом периоде. Не забывай «День заполнен».
          </p>
        ) : (
          <>
            <p class="small" style={{ margin: 0 }}>
              Сравнение: {formatDateRu(r.before.from)}–{formatDateRu(r.before.to)} ({r.before.completed} дн.) и{' '}
              {formatDateRu(r.during.from)}–{formatDateRu(r.during.to)} ({r.during.completed} дн.).
            </p>
            <div class="group">
              {r.rows.map((x) => (
                <div key={x.id} class="row-btn exp-row">
                  <span class="row-main">
                    <span class="row-title">{x.label}</span>
                    <span class="row-sub">{rowText(x)}</span>
                  </span>
                  <span class={`badge${x.clear ? '' : ' badge-outline'}`}>{x.clear ? 'устойчиво' : 'может быть случайно'}</span>
                </div>
              ))}
              {!r.rows.length && <p class="muted small" style={{ padding: '12px 16px', margin: 0 }}>Нечего сравнивать: в эти дни мало записей.</p>}
            </div>
            <p class="muted small" style={{ margin: 0 }}>
              «Устойчиво» — разница больше, чем бывает случайно (с поправкой на число сравнений). «Может быть случайно» — такая разница
              бывает и сама по себе, данных пока мало. Сравнение «до и во время» не учитывает другие перемены за это время: сезон, цикл, стресс, болезни.
            </p>
          </>
        )}
        <button type="button" class="btn btn-block" onClick={onEdit}>
          Изменить
        </button>
      </div>
    </Sheet>
  );
}

function ExperimentForm({ today, initial, onClose }: { today: string; initial?: Experiment; onClose: () => void }) {
  const db = getDb();
  const [name, setName] = useState(initial?.name ?? '');
  const [start, setStart] = useState(initial?.start ?? today);
  const [len, setLen] = useState(initial ? daysBetween(initial.start, initial.end) + 1 : 14);
  const [note, setNote] = useState(initial?.note ?? '');

  const save = async () => {
    const ok = await safe(async () => {
      const s = await getSettings(db);
      const list = s.experiments ?? [];
      const exp: Experiment = {
        id: initial?.id ?? crypto.randomUUID(),
        name: name.trim(),
        start,
        end: addDays(start, len - 1),
        ...(note.trim() && { note: note.trim() }),
        createdAt: initial?.createdAt ?? Date.now(),
      };
      await updateSettings(db, { experiments: initial ? list.map((x) => (x.id === exp.id ? exp : x)) : [...list, exp] });
      return true;
    });
    if (ok) {
      notify(initial ? 'Эксперимент изменён' : 'Эксперимент добавлен');
      onClose();
    }
  };
  const remove = async () => {
    if (!initial || !confirm(`Удалить эксперимент «${initial.name}»? Записи дневника не удалятся.`)) return;
    const ok = await safe(async () => {
      const s = await getSettings(db);
      await updateSettings(db, { experiments: (s.experiments ?? []).filter((x) => x.id !== initial.id) });
      return true;
    });
    if (ok) {
      notify('Эксперимент удалён');
      onClose();
    }
  };

  return (
    <Sheet
      title={initial ? 'Эксперимент' : 'Новый эксперимент'}
      onClose={onClose}
      footer={
        <button type="button" class="btn btn-primary btn-block" disabled={!name.trim()} onClick={() => void save()}>
          Сохранить
        </button>
      }
    >
      <div class="form">
        <label class="field">
          <span>Что меняешь</span>
          <input type="text" value={name} maxLength={80} placeholder="Например: без молочного" onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>Начало</span>
          <input type="date" value={start} onInput={(e) => e.currentTarget.value && setStart(e.currentTarget.value)} />
        </label>
        <div class="field">
          <span>Длительность</span>
          <div class="chips">
            {LENGTHS.map((l) => (
              <button type="button" key={l} class={`chip${len === l ? ' active' : ''}`} onClick={() => setLen(l)}>
                {l} дней
              </button>
            ))}
          </div>
          <span class="muted small">
            До {formatDateRu(addDays(start, len - 1))}. Сравнивается с таким же периодом перед началом — его тоже нужно заполнять.
          </span>
        </div>
        <label class="field">
          <span>Заметка</span>
          <textarea rows={2} value={note} maxLength={300} onInput={(e) => setNote(e.currentTarget.value)} />
        </label>
        {initial && (
          <button type="button" class="btn btn-danger btn-block" onClick={() => void remove()}>
            Удалить эксперимент
          </button>
        )}
      </div>
    </Sheet>
  );
}
