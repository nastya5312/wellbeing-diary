// Содержимое отчёта врачу как список блоков. Из него рисуются и экран, и PDF — текст один и тот же.
import type { ReportData } from './report';
import type { Signal } from '../analysis/analyze';
import { CATEGORY_LABEL, DISCLAIMER, signalTitle } from '../analysis/texts';
import { formatDateRu, formatDuration } from './dates';

export type Block =
  | { t: 'title'; text: string }
  | { t: 'h'; text: string }
  | { t: 'p'; text: string; muted?: boolean; italic?: boolean }
  | { t: 'row'; cols: [string, string, string] }
  | { t: 'li'; n: number; text: string };

const n1 = (x: number | null) => (x === null ? '—' : x.toFixed(1).replace('.', ','));
const num = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const ruDate = (iso: string) => iso.split('-').reverse().join('.');

// Ограничения строк — чтобы лист читался; PDF дополнительно уменьшает шрифт, если не помещается
const MAX_SYMPTOMS = 8;
const MAX_INTAKE = 8;
const MAX_METRICS = 6;

/** Выбор до 5 выводов для отчёта: тег и продукт из этого тега с тем же результатом — один вывод. */
export function pickReportSignals(signals: Signal[], hidden: Set<string>): Signal[] {
  const overlaps = (a: Signal, b: Signal) =>
    a.outcomeId === b.outcomeId && a.lag === b.lag && !!a.factorMembers && !!b.factorMembers &&
    a.factorMembers.some((m) => b.factorMembers!.includes(m));
  const picked: Signal[] = [];
  for (const s of signals) {
    if (hidden.has(s.id) || picked.some((p) => overlaps(p, s))) continue;
    picked.push(s);
    if (picked.length === 5) break;
  }
  return picked;
}

export function reportBlocks(d: ReportData, signals: Signal[] | null, createdOn: string): Block[] {
  const b: Block[] = [];
  b.push({ t: 'title', text: 'Дневник самочувствия — сводка' });
  b.push({ t: 'p', text: `Период: ${formatDateRu(d.from)} — ${formatDateRu(d.to)} (${d.periodDays} дн.). Полностью заполнено дней: ${d.completedDays}. Сформировано ${formatDateRu(createdOn)}.` });

  b.push({ t: 'h', text: 'Сон и самочувствие' });
  b.push({
    t: 'p',
    text:
      `Ночей с записью: ${d.sleep.nights}. Средний сон: ${d.sleep.avgMin === null ? '—' : formatDuration(d.sleep.avgMin)}; качество ${n1(d.sleep.avgQuality)} из 5; ` +
      `коротких ночей: ${d.sleep.shortNights}. Среднее за ${d.wellbeing.days} дн.: настроение ${n1(d.wellbeing.mood)}, энергия ${n1(d.wellbeing.energy)}, ` +
      `стресс ${n1(d.wellbeing.stress)} (шкалы 1–5).`,
  });

  b.push({ t: 'h', text: 'Симптомы (дней с симптомом из заполненных)' });
  if (!d.symptoms.length) b.push({ t: 'p', text: 'Не отмечались.' });
  for (const s of d.symptoms.slice(0, MAX_SYMPTOMS)) {
    b.push({ t: 'row', cols: [s.name, `${s.days} из ${s.of} (${pct(s.days, s.of)})`, s.avgIntensity !== null ? `сила ср. ${n1(s.avgIntensity)}/5` : ''] });
  }
  if (d.symptoms.length > MAX_SYMPTOMS) b.push({ t: 'p', text: `И ещё ${d.symptoms.length - MAX_SYMPTOMS} реже.`, muted: true });

  b.push({ t: 'h', text: 'Лекарства и добавки (дней приёма в периоде)' });
  if (!d.intake.length) b.push({ t: 'p', text: 'Не отмечались.' });
  for (const x of d.intake.slice(0, MAX_INTAKE)) {
    b.push({
      t: 'row',
      cols: [
        `${x.name} · ${x.kind === 'med' ? 'лекарство' : 'добавка'}`,
        `${x.days} дн.`,
        x.courses.length
          ? `курс: ${x.courses.map((c) => c.replace(/\d{4}-\d{2}-\d{2}/g, ruDate)).join('; ')}`
          : `${formatDateRu(x.first)}–${formatDateRu(x.last)}`,
      ],
    });
  }
  if (d.intake.length > MAX_INTAKE) b.push({ t: 'p', text: `И ещё ${d.intake.length - MAX_INTAKE} реже.`, muted: true });
  if (d.intervals.length) {
    b.push({
      t: 'p',
      text:
        'Интервал до первой еды/напитка после приёма: ' +
        d.intervals
          .slice(0, 4)
          .map((iv) => `${iv.name} — медиана ${iv.medianMin === null ? '—' : formatDuration(iv.medianMin)}, меньше 1 ч в ${iv.within60} из ${iv.days}`)
          .join('; ') +
        ' (дней).',
    });
  }

  if (d.metrics.length) {
    b.push({ t: 'h', text: 'Показатели' });
    for (const m of d.metrics.slice(0, MAX_METRICS)) {
      const norm = m.refLow !== undefined || m.refHigh !== undefined ? ` · норма ${m.refLow !== undefined ? num(m.refLow) : '…'}–${m.refHigh !== undefined ? num(m.refHigh) : '…'}` : '';
      b.push({
        t: 'row',
        cols: [
          m.name,
          m.n === 1 ? `${num(m.last.value)} ${m.unit} (${formatDateRu(m.last.date)})` : `${num(m.first.value)} → ${num(m.last.value)} ${m.unit}`,
          `${m.n > 1 ? `${m.n} изм., ${num(m.min)}–${num(m.max)}` : ''}${norm}`,
        ],
      });
    }
    if (d.metrics.length > MAX_METRICS) b.push({ t: 'p', text: `И ещё показателей: ${d.metrics.length - MAX_METRICS} (все — в приложении).`, muted: true });
  }

  b.push({ t: 'h', text: 'Цикл и стул' });
  b.push({
    t: 'p',
    text:
      `Дней месячных: ${d.cycle.periodDays}. ` +
      (d.cycle.starts.length ? `Начала циклов: ${d.cycle.starts.map(formatDateRu).join(', ')}. ` : 'Начал циклов в периоде нет. ') +
      (d.cycle.lengths.length ? `Длины циклов: ${d.cycle.lengths.join(', ')} дн. ` : '') +
      (d.stool.days
        ? `Стул отмечен в ${d.stool.days} дн.: не было — ${d.stool.noneDays}, твёрдый (тип 1–2) — ${d.stool.hardDays}, жидкий (тип 6–7) — ${d.stool.looseDays}.`
        : ''),
  });

  b.push({ t: 'h', text: 'Совпадения в записях (гипотезы, не диагноз)' });
  if (signals === null) b.push({ t: 'p', text: 'Считаю…' });
  else if (!signals.length) b.push({ t: 'p', text: 'Устойчивых совпадений не найдено или данных пока мало (нужно 30+ заполненных дней).' });
  else
    signals.forEach((s, i) =>
      b.push({
        t: 'li',
        n: i + 1,
        text:
          `${signalTitle(s)}: ${s.a} из ${s.a + s.b} против ${s.c} из ${s.c + s.d} в остальные дни ` +
          `[${CATEGORY_LABEL[s.category]}; гипотеза, не диагноз${s.confounds.length ? `; совпадает с «${s.confounds[0]!.gLabel}»` : ''}]`,
      }),
    );
  b.push({ t: 'p', italic: true, text: `${DISCLAIMER} Совпадения посчитаны по всем записям дневника. Данные внесены пациенткой самостоятельно.` });
  return b;
}
