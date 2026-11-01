import { useState } from 'preact/hooks';
import type { Timeline } from '../analysis/factors';
import { REPEAT_LAGS, repeatFactors, repeatOutcomes, repeats } from '../analysis/repeats';
import { repeatsLine, repeatsTitle } from '../analysis/texts';
import { Sheet } from './Sheet';
import { formatDateRu } from '../lib/dates';
import { loadState, saveState } from '../lib/storage';

const KEY = 'repeats-choice';
const mark = (v: boolean | undefined) => (v === true ? '✓' : v === false ? '—' : '?');

// «Повторы» (ТЗ, 7.8): каждый случай X и что было в тот же день, через 1 и 2 дня. Без статистики.
export function RepeatsCard({ timeline }: { timeline: Timeline }) {
  const factors = repeatFactors(timeline).sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  const outcomes = repeatOutcomes(timeline).sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  const saved = loadState<{ f?: string; o?: string }>(KEY, {});
  const [fId, setF] = useState(saved.f && factors.some((f) => f.id === saved.f) ? saved.f : '');
  const [oId, setO] = useState(saved.o && outcomes.some((o) => o.id === saved.o) ? saved.o : '');
  const [showDates, setShowDates] = useState(false);

  const choose = (f: string, o: string) => {
    setF(f);
    setO(o);
    saveState(KEY, { f, o });
  };

  const f = factors.find((x) => x.id === fId);
  const o = outcomes.find((x) => x.id === oId);
  const r = f && o ? repeats(timeline, f.id, o.id) : null;

  return (
    <section class="panel">
      <h2>Повторы</h2>
      <p class="muted small">Что было после каждого случая: в тот же день, на следующий и через день. Просто счёт, без статистики.</p>
      {factors.length === 0 || outcomes.length === 0 ? (
        <p class="muted small">Пока не из чего считать: нужны отметки в заполненные дни.</p>
      ) : (
        <div class="form">
          <label class="field">
            <span>После чего</span>
            <select value={fId} onChange={(e) => choose(e.currentTarget.value, oId)}>
              <option value="">— выбери —</option>
              {factors.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label class="field">
            <span>Что смотреть</span>
            <select value={oId} onChange={(e) => choose(fId, e.currentTarget.value)}>
              <option value="">— выбери —</option>
              {outcomes.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {r && f && o && (
        <div class="repeats">
          <p>
            <b>{repeatsTitle(f.label, r.occasions)}:</b>
          </p>
          {r.lines.map((l) => (
            <p key={l.lag} class="small">
              {repeatsLine(o.label, l)}
            </p>
          ))}
          <p class="muted small">Считаются только заполненные дни. Это совпадения, а не доказанная связь.</p>
          {r.occasions > 0 && (
            <button type="button" class="btn btn-small" onClick={() => setShowDates(true)}>
              Показать даты
            </button>
          )}
        </div>
      )}
      {showDates && r && f && o && (
        <Sheet title="Даты" onClose={() => setShowDates(false)}>
          <p class="small">
            {repeatsTitle(f.label, r.occasions)} → «{o.label}». ✓ — было, — — не было, ? — день не заполнен.
          </p>
          <table class="repeats-table small">
            <thead>
              <tr>
                <th>Дата</th>
                {REPEAT_LAGS.map((lag) => (
                  <th key={lag}>{lag === 0 ? 'в тот же' : `+${lag}`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...r.rows].reverse().map((row) => (
                <tr key={row.date}>
                  <td>{formatDateRu(row.date)}</td>
                  {row.values.map((v, i) => (
                    <td key={i} class={v ? 'yes' : ''}>
                      {mark(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Sheet>
      )}
    </section>
  );
}
