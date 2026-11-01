import { useState } from 'preact/hooks';
import { getDb } from '../db/schema';
import { listDays, listEventsRange, listItems } from '../db/repo';
import { DailyChart } from '../components/DailyChart';
import { LineChart } from '../components/LineChart';
import { listDailyMetrics } from '../db/courses';
import { useLive } from '../lib/useLive';
import { addDays, formatDateRu, formatDuration } from '../lib/dates';
import {
  dateRange, flowSet, mean, presence, sleepHoursSeries, sleepQualitySeries, symptomSeries, wellbeingSeries,
} from '../lib/trends';
import { cycles, cycleStats } from '../lib/cycle';

const PERIODS = [30, 90, 365] as const;
const fmt1 = (v: number) => v.toFixed(1).replace('.', ',');

// Тренды за 30/90/365 дней: сон, самочувствие, выбранный симптом, месячные, длина циклов.
export function Trends({ today }: { today: string }) {
  const db = getDb();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(30);
  const [symptomId, setSymptomId] = useState<string | null>(null);
  const from = addDays(today, -(period - 1));

  const data = useLive(async () => {
    const [days, events, symptoms, allFlowDays, dailyMetrics, measurements] = await Promise.all([
      listDays(db, from, today),
      listEventsRange(db, from, today),
      listItems(db, { kind: 'symptom', includeArchived: true }),
      db.days.filter((d) => (d.flow ?? 0) > 0).toArray(),
      listDailyMetrics(db),
      db.measurements.where('date').between(from, today, true, true).toArray(),
    ]);
    return { days, events, symptoms, allFlow: allFlowDays.map((d) => d.date), dailyMetrics, measurements };
  }, [from, today]);

  if (!data) return null;
  const dates = dateRange(from, today);
  const days = new Map(data.days.map((d) => [d.date, d]));
  const flow = flowSet(data.days);
  const completed = data.days.filter((d) => d.completed).length;

  const sleepH = sleepHoursSeries(dates, days);
  const sleepQ = sleepQualitySeries(dates, days);
  const mood = wellbeingSeries(dates, days, 'mood');
  const energy = wellbeingSeries(dates, days, 'energy');
  const stress = wellbeingSeries(dates, days, 'stress');

  // Симптомы, которые встречались в периоде, — сначала самые частые
  const symptomCounts = new Map<string, number>();
  for (const e of data.events) if (e.kind === 'symptom') symptomCounts.set(e.itemId, (symptomCounts.get(e.itemId) ?? 0) + 1);
  const seenSymptoms = data.symptoms
    .filter((s) => symptomCounts.has(s.id))
    .sort((a, b) => (symptomCounts.get(b.id) ?? 0) - (symptomCounts.get(a.id) ?? 0));
  const currentSymptom = seenSymptoms.find((s) => s.id === symptomId) ?? seenSymptoms[0];
  const symSeries = currentSymptom ? symptomSeries(dates, days, data.events, currentSymptom.id) : null;
  const symPresence = symSeries ? presence(symSeries) : null;

  const cycleList = cycles(data.allFlow);
  const stats = cycleStats(cycleList);
  const avgSleep = mean(sleepH);

  return (
    <div class="screen">
      <div class="chips" role="tablist" aria-label="Период">
        {PERIODS.map((p) => (
          <button type="button" role="tab" key={p} aria-selected={period === p} class={`chip${period === p ? ' active' : ''}`} onClick={() => setPeriod(p)}>
            {p} дней
          </button>
        ))}
      </div>
      <p class="muted small">
        {formatDateRu(from)} — {formatDateRu(today)} · заполнено дней: {completed} из {period}
      </p>

      <section class="panel">
        <h2>Сон</h2>
        <p class="small">
          {avgSleep !== null ? `В среднем ${formatDuration(avgSleep * 60)}` : 'Нет данных о сне'}
          {mean(sleepQ) !== null && ` · качество ${fmt1(mean(sleepQ)!)} из 5`}
        </p>
        <DailyChart title="Длительность сна, часы" dates={dates} series={[{ label: 'часы', values: sleepH, variant: 1 }]} yMin={0} yMax={12} yTicks={[0, 4, 8, 12]} flow={flow} />
        <DailyChart title="Качество сна" dates={dates} series={[{ label: 'качество', values: sleepQ, variant: 2 }]} yMin={1} yMax={5} yTicks={[1, 3, 5]} flow={flow} />
      </section>

      <section class="panel">
        <h2>Самочувствие</h2>
        <p class="small">
          {[
            mean(mood) !== null && `настроение ${fmt1(mean(mood)!)}`,
            mean(energy) !== null && `энергия ${fmt1(mean(energy)!)}`,
            mean(stress) !== null && `стресс ${fmt1(mean(stress)!)}`,
          ]
            .filter(Boolean)
            .join(' · ') || 'Нет данных'}
        </p>
        <DailyChart
          title="Настроение, энергия и стресс"
          dates={dates}
          series={[
            { label: 'настроение', values: mood, variant: 1 },
            { label: 'энергия', values: energy, variant: 2 },
            { label: 'стресс', values: stress, variant: 3 },
          ]}
          yMin={1}
          yMax={5}
          yTicks={[1, 3, 5]}
          flow={flow}
        />
      </section>

      <section class="panel">
        <h2>Симптом по дням</h2>
        {seenSymptoms.length === 0 ? (
          <p class="small muted">За этот период симптомы не отмечались.</p>
        ) : (
          <>
            <div class="chips">
              {seenSymptoms.map((s) => (
                <button type="button" key={s.id} class={`chip${currentSymptom?.id === s.id ? ' active' : ''}`} onClick={() => setSymptomId(s.id)}>
                  {s.name}
                </button>
              ))}
            </div>
            {symPresence && (
              <p class="small">
                Был в {symPresence.present} из {symPresence.known} дней с данными. Высота столбца — сила (1–5); черта у оси —
                заполненный день без симптома.
              </p>
            )}
            {symSeries && currentSymptom && (
              <DailyChart title={currentSymptom.name} dates={dates} series={[{ label: currentSymptom.name, values: symSeries, variant: 3 }]} yMin={0} yMax={5} yTicks={[0, 1, 3, 5]} kind="bar" flow={flow} />
            )}
          </>
        )}
      </section>

      {data.dailyMetrics.map((m) => {
        const pts = data.measurements.filter((v) => v.metricId === m.id).map((v) => ({ date: v.date, value: v.value }));
        return (
          <section class="panel" key={m.id}>
            <h2>{m.name}</h2>
            {pts.length ? (
              <LineChart label={m.name} unit={m.unit} points={pts} refLow={m.refLow} refHigh={m.refHigh} />
            ) : (
              <p class="muted small">За период значений нет.</p>
            )}
          </section>
        );
      })}

      <section class="panel">
        <h2>Цикл</h2>
        {cycleList.length === 0 && <p class="small muted">Месячные ещё не отмечались (вечерний чек-ин → «Месячные»).</p>}
        {cycleList.length > 0 && !stats && <p class="small">Начало цикла: {formatDateRu(cycleList[cycleList.length - 1]!.start)}. Длина появится после следующего начала.</p>}
        {stats && (
          <p class="small">
            Циклов: {stats.count} · средняя длина {fmt1(stats.avg)} дн. · от {stats.min} до {stats.max}
          </p>
        )}
        {cycleList.length > 0 && (
          <ul class="list small">
            {[...cycleList].reverse().slice(0, 12).map((c) => (
              <li key={c.start} class="row center cycle-row">
                <span class="grow">с {formatDateRu(c.start)}</span>
                <span>{c.length !== null ? `${c.length} дн.` : 'идёт'}</span>
                <span class="muted">месячные {c.periodDays} дн.</span>
              </li>
            ))}
          </ul>
        )}
        <p class="muted small">Новый цикл считается с первого дня месячных после 3+ дней без них.</p>
      </section>
    </div>
  );
}
