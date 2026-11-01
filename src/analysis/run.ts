// Запуск анализа: в фоновом потоке (Web Worker), с кэшем до изменения данных (ТЗ, 7.11).
import type { DiaryDB } from '../db/schema';
import { getSettings } from '../db/repo';
import { analyze, type AnalysisResult } from './analyze';
import type { AnalysisInput } from './factors';
import { hashString } from './permutation';

export type UiResult = Omit<AnalysisResult, 'timeline'> & { computedAt: number; ms: number };

let cache: { key: number; result: UiResult } | null = null;

export async function loadInput(db: DiaryDB): Promise<AnalysisInput> {
  const [days, events, items, courses, settings] = await Promise.all([
    db.days.toArray(),
    db.events.toArray(),
    db.items.toArray(),
    db.courses.toArray(),
    getSettings(db),
  ]);
  // Скрытые выводы и заметки не влияют на расчёт — убираем их из ключа кэша
  const { hiddenInsights: _h, insightNotes: _n, lastExportAt: _l, ...calcSettings } = settings;
  return { days, events, items, courses, settings: { ...calcSettings, version: settings.version } };
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
