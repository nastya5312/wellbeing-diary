import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { getDb } from '../db/schema';
import { getSettings } from '../db/repo';
import { buildReport, type ReportData } from '../lib/report';
import { pickReportSignals, reportBlocks, type Block } from '../lib/reportBlocks';
import { reportPdf } from '../lib/reportCanvas';
import { shareFile } from '../lib/share';
import { runAnalysis } from '../analysis/run';
import type { Signal } from '../analysis/analyze';
import { useLive } from '../lib/useLive';
import { notify, safe } from '../lib/notify';
import { addDays, localDate } from '../lib/dates';

const PERIODS = [30, 90, 180, 365] as const;

// Отчёт врачу (ТЗ, 6.9): один лист A4, чёрно-белый. PDF собирается в самом приложении —
// системная печать в приложении с экрана «Домой» на iPhone не работает.
export function Report({ today, onBack }: { today: string; onBack: () => void }) {
  const db = getDb();
  const [period, setPeriod] = useState<number>(90);
  const from = addDays(today, -(period - 1));
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [busy, setBusy] = useState(false);

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
      setSignals(r.enough ? pickReportSignals(r.signals, new Set(settings.hiddenInsights ?? [])) : []);
    });
  }, []);

  const blocks = data ? reportBlocks(data, signals, localDate(new Date())) : null;
  const ready = !!blocks && signals !== null && !busy;

  const savePdf = async (how: 'share' | 'download') => {
    if (!blocks || !data) return;
    setBusy(true);
    const ok = await safe(async () => shareFile(await reportPdf(blocks), `otchet-${data.from}_${data.to}.pdf`, how));
    setBusy(false);
    if (ok && how === 'download') notify('PDF сохранён в «Загрузки»');
  };

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
        <button type="button" class="btn btn-primary btn-block" disabled={!ready} onClick={() => void savePdf('share')}>
          {busy ? 'Готовлю PDF…' : signals === null ? 'Считаю совпадения…' : 'Сохранить PDF (A4)'}
        </button>
        <button type="button" class="btn btn-block" disabled={!ready} onClick={() => void savePdf('download')}>
          Скачать PDF в «Загрузки»
        </button>
        <p class="muted small">
          Откроется меню «Поделиться»: выбери «Сохранить в Файлы» или отправь врачу. Распечатать можно из «Файлов»: открыть PDF →
          «Поделиться» → «Напечатать». Ниже — то, что будет на листе.
        </p>
      </div>

      {blocks && <ReportSheet blocks={blocks} />}
    </div>
  );
}

function ReportSheet({ blocks }: { blocks: Block[] }) {
  const out: JSX.Element[] = [];
  let rows: Extract<Block, { t: 'row' }>[] = [];
  let items: Extract<Block, { t: 'li' }>[] = [];
  // Подряд идущие строки таблицы и пункты списка собираются вместе
  const flush = () => {
    if (rows.length) {
      out.push(
        <table key={`t${out.length}`}>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.cols[0]}</td>
                <td class="r">{r.cols[1]}</td>
                <td class="r">{r.cols[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>,
      );
      rows = [];
    }
    if (items.length) {
      out.push(
        <ol key={`l${out.length}`}>
          {items.map((l, i) => (
            <li key={i}>{l.text}</li>
          ))}
        </ol>,
      );
      items = [];
    }
  };
  blocks.forEach((b, i) => {
    if (b.t === 'row') {
      if (items.length) flush();
      rows.push(b);
      return;
    }
    if (b.t === 'li') {
      if (rows.length) flush();
      items.push(b);
      return;
    }
    flush();
    if (b.t === 'title') out.push(<h2 key={i}>{b.text}</h2>);
    else if (b.t === 'h') out.push(<h3 key={i}>{b.text}</h3>);
    else out.push(<p key={i} class={b.italic ? 'report-foot' : b.muted ? 'muted' : ''}>{b.text}</p>);
  });
  flush();
  return <article class="report">{out}</article>;
}
