import { useEffect, useState } from 'preact/hooks';
import { getDb } from '../db/schema';
import { getSettings } from '../db/repo';
import { buildReport, type ReportData } from '../lib/report';
import { runAnalysis } from '../analysis/run';
import type { Signal } from '../analysis/analyze';
import { CATEGORY_LABEL, DISCLAIMER, signalTitle } from '../analysis/texts';
import { useLive } from '../lib/useLive';
import { safe } from '../lib/notify';
import { addDays, formatDateRu, formatDuration, localDate } from '../lib/dates';

const PERIODS = [30, 90, 180, 365] as const;
const n1 = (x: number | null) => (x === null ? '—' : x.toFixed(1).replace('.', ','));
const num = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
// Ограничения строк, чтобы отчёт всегда помещался на один лист A4 (проверено на «тяжёлых» данных)
const MAX_SYMPTOMS = 8;
const MAX_INTAKE = 8;
const MAX_METRICS = 6;

// Отчёт врачу (ТЗ, 6.9): одна страница A4, чёрно-белая, через системную печать.
export function Report({ today, onBack }: { today: string; onBack: () => void }) {
  const db = getDb();
  const [period, setPeriod] = useState<number>(90);
  const from = addDays(today, -(period - 1));
  const [signals, setSignals] = useState<Signal[] | null>(null);

  const data = useLive(async (): Promise<ReportData> => {
    const [days, events, items, courses, metrics, measurements, settings] = await Promise.all([
      db.days.where('date').between(from, today, true, true).toArray(),
      db.events.where('date').between(from, today, true, true).toArray(),
      db.items.toArray(),
      db.courses.toArray(),
      db.metrics.toArray(),
      db.measurements.where('date').between(from, today, true, true).toArray(),
      getSettings(db),
    ]);
    const allFlow = await db.days.filter((d) => (d.flow ?? 0) > 0).toArray();
    return buildReport({
      from, to: today, events, items, courses, metrics, measurements, shortSleepMin: settings.shortSleepMin,
      // Для длины циклов нужны и месячные до начала периода
      days: [...days, ...allFlow.filter((d) => d.date < from)],
    });
  }, [from, today]);

  useEffect(() => {
    void safe(async () => {
      const [r, settings] = await Promise.all([runAnalysis(db), getSettings(db)]);
      const hidden = new Set(settings.hiddenInsights ?? []);
      // Тег и продукт из этого тега с тем же результатом и сдвигом — по сути один вывод: в отчёт идёт первый
      const overlaps = (a: Signal, b: Signal) =>
        a.outcomeId === b.outcomeId && a.lag === b.lag && !!a.factorMembers && !!b.factorMembers &&
        a.factorMembers.some((m) => b.factorMembers!.includes(m));
      const picked: Signal[] = [];
      for (const s of r.enough ? r.signals : []) {
        if (hidden.has(s.id) || picked.some((p) => overlaps(p, s))) continue;
        picked.push(s);
        if (picked.length === 5) break;
      }
      setSignals(picked);
    });
  }, []);

  return (
    <div class="screen">
      <header class="screen-head row center no-print">
        <button type="button" class="icon-btn" onClick={onBack} aria-label="Назад">
          ‹
        </button>
        <h1>Отчёт для врача</h1>
      </header>
      <div class="no-print stack">
        <div class="chips" role="tablist" aria-label="Период">
          {PERIODS.map((p) => (
            <button type="button" role="tab" key={p} aria-selected={period === p} class={`chip${period === p ? ' active' : ''}`} onClick={() => setPeriod(p)}>
              {p} дней
            </button>
          ))}
        </div>
        <button type="button" class="btn btn-primary btn-block" onClick={() => window.print()}>
          Печать / Сохранить в Файлы (PDF)
        </button>
        <p class="muted small">
          В окне печати: чтобы получить PDF, разведи двумя пальцами превью страницы и нажми «Поделиться» → «Сохранить в Файлы».
          Ниже — то, что попадёт на лист.
        </p>
      </div>

      {data && <ReportSheet d={data} signals={signals} />}
    </div>
  );
}

function ReportSheet({ d, signals }: { d: ReportData; signals: Signal[] | null }) {
  const meds = d.intake.filter((x) => x.kind === 'med');
  const sups = d.intake.filter((x) => x.kind === 'supplement');
  return (
    <article class="report">
      <h2>Дневник самочувствия — сводка</h2>
      <p>
        Период: {formatDateRu(d.from)} — {formatDateRu(d.to)} ({d.periodDays} дн.). Полностью заполнено дней: {d.completedDays}.
        Сформировано {formatDateRu(localDate(new Date()))}.
      </p>

      <h3>Сон и самочувствие</h3>
      <p>
        Ночей с записью: {d.sleep.nights}. Средний сон: {d.sleep.avgMin === null ? '—' : formatDuration(d.sleep.avgMin)}; качество {n1(d.sleep.avgQuality)} из 5;
        коротких ночей: {d.sleep.shortNights}. Среднее за {d.wellbeing.days} дн.: настроение {n1(d.wellbeing.mood)}, энергия {n1(d.wellbeing.energy)}, стресс{' '}
        {n1(d.wellbeing.stress)} (шкалы 1–5).
      </p>

      <h3>Симптомы (дней с симптомом из заполненных)</h3>
      {d.symptoms.length ? (
        <table>
          <tbody>
            {d.symptoms.slice(0, MAX_SYMPTOMS).map((s) => (
              <tr key={s.name}>
                <td>{s.name}</td>
                <td class="r">
                  {s.days} из {s.of} ({pct(s.days, s.of)})
                </td>
                <td class="r">{s.avgIntensity !== null ? `сила ср. ${n1(s.avgIntensity)}/5` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>Не отмечались.</p>
      )}
      {d.symptoms.length > MAX_SYMPTOMS && <p class="muted">И ещё {d.symptoms.length - MAX_SYMPTOMS} реже.</p>}

      <h3>Лекарства и добавки (дней приёма в периоде)</h3>
      {d.intake.length ? (
        <table>
          <tbody>
            {[...meds, ...sups].slice(0, MAX_INTAKE).map((x) => (
              <tr key={x.name}>
                <td>
                  {x.name}
                  <span class="muted"> · {x.kind === 'med' ? 'лекарство' : 'добавка'}</span>
                </td>
                <td class="r">{x.days} дн.</td>
                <td class="r">
                  {x.courses.length ? `курс: ${x.courses.map((c) => c.split('-').reverse().join('.')).join('; ')}` : `${formatDateRu(x.first)}–${formatDateRu(x.last)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>Не отмечались.</p>
      )}
      {d.intake.length > MAX_INTAKE && <p class="muted">И ещё {d.intake.length - MAX_INTAKE} реже.</p>}
      {d.intervals.length > 0 && (
        <p>
          Интервал до первой еды/напитка после приёма:{' '}
          {d.intervals.slice(0, 4).map((iv) => `${iv.name} — медиана ${iv.medianMin === null ? '—' : formatDuration(iv.medianMin)}, меньше 1 ч в ${iv.within60} из ${iv.days}`).join('; ')} (дней).
        </p>
      )}

      {d.metrics.length > 0 && (
        <>
          <h3>Показатели</h3>
          <table>
            <tbody>
              {d.metrics.slice(0, MAX_METRICS).map((m) => (
                <tr key={m.name}>
                  <td>{m.name}</td>
                  <td class="r">
                    {m.n === 1
                      ? `${num(m.last.value)} ${m.unit} (${formatDateRu(m.last.date)})`
                      : `${num(m.first.value)} → ${num(m.last.value)} ${m.unit}`}
                  </td>
                  <td class="r">
                    {m.n > 1 && `${m.n} изм., ${num(m.min)}–${num(m.max)}`}
                    {(m.refLow !== undefined || m.refHigh !== undefined) &&
                      ` · норма ${m.refLow !== undefined ? num(m.refLow) : '…'}–${m.refHigh !== undefined ? num(m.refHigh) : '…'}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.metrics.length > MAX_METRICS && <p class="muted">И ещё показателей: {d.metrics.length - MAX_METRICS} (все — в приложении).</p>}
        </>
      )}

      <h3>Цикл и стул</h3>
      <p>
        Дней месячных: {d.cycle.periodDays}.{' '}
        {d.cycle.starts.length ? `Начала циклов: ${d.cycle.starts.map(formatDateRu).join(', ')}.` : 'Начал циклов в периоде нет.'}{' '}
        {d.cycle.lengths.length > 0 && `Длины циклов: ${d.cycle.lengths.join(', ')} дн.`}
        {d.stool.days > 0
          ? ` Стул отмечен в ${d.stool.days} дн.: не было — ${d.stool.noneDays}, твёрдый (тип 1–2) — ${d.stool.hardDays}, жидкий (тип 6–7) — ${d.stool.looseDays}.`
          : ''}
      </p>

      <h3>Совпадения в записях (гипотезы, не диагноз)</h3>
      {signals === null && <p>Считаю…</p>}
      {signals && signals.length === 0 && <p>Устойчивых совпадений не найдено или данных пока мало (нужно 30+ заполненных дней).</p>}
      {signals && signals.length > 0 && (
        <ol>
          {signals.map((s) => (
            <li key={s.id}>
              {signalTitle(s)}: {s.a} из {s.a + s.b} против {s.c} из {s.c + s.d} в остальные дни [{CATEGORY_LABEL[s.category]}; гипотеза, не диагноз
              {s.confounds.length > 0 && `; совпадает с «${s.confounds[0]!.gLabel}»`}]
            </li>
          ))}
        </ol>
      )}
      <p class="report-foot">
        {DISCLAIMER} Совпадения посчитаны по всем записям дневника. Данные внесены пациенткой самостоятельно.
      </p>
    </article>
  );
}
