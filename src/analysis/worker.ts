// Фоновый поток: анализ не подвешивает интерфейс.
import { analyze } from './analyze';
import type { AnalysisInput } from './factors';

self.onmessage = (e: MessageEvent<AnalysisInput>) => {
  try {
    const { timeline: _timeline, ...result } = analyze(e.data);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
