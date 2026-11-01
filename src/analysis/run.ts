// Запуск анализа: в фоновом потоке (Web Worker), с кэшем до изменения данных (ТЗ, 7.11).
import type { DiaryDB } from '../db/schema';
import { getSettings } from '../db/repo';
import { analyze, type AnalysisResult } from './analyze';
import { buildTimeline, type AnalysisInput, type Timeline } from './factors';
import { hashString } from './permutation';

export type UiResult = Omit<AnalysisResult, 'timeline'> & { computedAt: number; ms: number };

let cache: { key: number; result: UiResult } | null = null;

export async function loadInput(db: DiaryDB): Promise<AnalysisInput> {
  const [days, events, items, courses, settings, metrics, measurements] = await Promise.all([
    db.days.toArray(),
    db.events.toArray(),
    db.items.toArray(),
    db.courses.toArray(),
    getSettings(db),
    db.metrics.toArray(),
    db.measurements.toArray(),
  ]);
  // Скрытые выводы и заметки не влияют на расчёт — убираем их из ключа кэша
  const { hiddenInsights: _h, insightNotes: _n, lastExportAt: _l, ...calcSettings } = settings;
  // «daily» и заметки показателей на расчёт не влияют
  const calcMetrics = metrics.map(({ daily: _d, ...m }) => m);
  const calcMeasurements = measurements.map(({ note: _n, ts: _t, ...m }) => m);
  return { days, events, items, courses, settings: { ...calcSettings, version: settings.version }, metrics: calcMetrics, measurements: calcMeasurements };
}

function inWorker(input: AnalysisInput): Promise<Omit<AnalysisResult, 'timeline'>> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ ok: boolean; result?: Omit<AnalysisResult, 'timeline'>; error?: string }>) => {
      w.terminate();
      if (e.data.ok && e.data.result) resolve(e.data.result);
      else reject(new Error(e.data.error ?? 'Ошибка анализа'));
    };
    w.onerror = (e) => {
      w.terminate();
      reject(new Error(e.message || 'Фоновый поток недоступен'));
    };
    w.postMessage(input);
  });
}

export async function runAnalysis(db: DiaryDB, force = false): Promise<UiResult> {
  const input = await loadInput(db);
  const key = hashString(JSON.stringify(input));
  if (!force && cache?.key === key) return cache.result;
  const t0 = performance.now();
  let raw: Omit<AnalysisResult, 'timeline'>;
  try {
    raw = await inWorker(input);
  } catch {
    // Если фоновый поток не запустился — считаем в основном
    const { timeline: _t, ...r } = analyze(input);
    raw = r;
  }
  const result: UiResult = { ...raw, computedAt: Date.now(), ms: Math.round(performance.now() - t0) };
  cache = { key, result };
  return result;
}

let timelineCache: { key: number; t: Timeline } | null = null;

/** Ряды по дням для «Повторов» — быстро, считается в основном потоке. */
export async function loadTimeline(db: DiaryDB): Promise<Timeline> {
  const input = await loadInput(db);
  const key = hashString(JSON.stringify(input));
  if (timelineCache?.key !== key) timelineCache = { key, t: buildTimeline(input) };
  return timelineCache.t;
}
