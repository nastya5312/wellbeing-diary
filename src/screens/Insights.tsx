import { useEffect, useState } from 'preact/hooks';
import { getDb } from '../db/schema';
import { getSettings, updateSettings } from '../db/repo';
import { loadTimeline, runAnalysis, type UiResult } from '../analysis/run';
import { RepeatsCard } from '../components/RepeatsCard';
import { WhyPanel } from '../components/WhyPanel';
import { Icon, IconBadge } from '../components/Icon';
import type { Correlation, Signal } from '../analysis/analyze';
import {
  CATEGORY_LABEL, DISCLAIMER, confoundTexts, correlationDetails, correlationTitle, rrText, signalDetails, signalTitle,
} from '../analysis/texts';
import { MIN_COMPLETED_DAYS } from '../analysis/thresholds';
import { Sheet } from '../components/Sheet';
import { useLive } from '../lib/useLive';
import { safe, notify } from '../lib/notify';
import { formatDateRu } from '../lib/dates';

const fmtQ = (q: number) => (q < 0.001 ? 'q < 0,001' : `q = ${q.toFixed(3).replace('.', ',')}`);

export function Insights({ onOpenReport }: { onOpenReport?: () => void }) {
  const db = getDb();
  const settings = useLive(() => getSettings(db), []);
  const timeline = useLive(() => loadTimeline(db), []);
  const [result, setResult] = useState<UiResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDates, setShowDates] = useState<Signal | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [whyId, setWhyId] = useState<string | null>(null);
  // Симптомы, которые отмечались, — по частоте
  const symptoms = useLive(async () => {
    const [items, evs] = await Promise.all([db.items.where('kind').equals('symptom').toArray(), db.events.where('kind').equals('symptom').toArray()]);
    const cnt = new Map<string, number>();
    for (const e of evs) cnt.set(e.itemId, (cnt.get(e.itemId) ?? 0) + 1);
    return items.filter((it) => cnt.has(it.id)).sort((a, b) => cnt.get(b.id)! - cnt.get(a.id)!).map((it) => ({ id: it.id, name: it.name, n: cnt.get(it.id)! }));
  }, []);

  const run = async (force = false) => {
    setBusy(true);
    const r = await safe(() => runAnalysis(db, force));
    setBusy(false);
    if (r) setResult(r);
  };
  useEffect(() => void run(), []);

  const hidden = new Set(settings?.hiddenInsights ?? []);
  const notes = settings?.insightNotes ?? {};
  const toggleHidden = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    void safe(() => updateSettings(db, { hiddenInsights: [...next] })).then(() => notify(next.has(id) ? 'Вывод скрыт' : 'Вывод возвращён'));
  };

  const visibleSignals = result?.signals.filter((s) => !hidden.has(s.id)) ?? [];
  const visibleCorr = result?.correlations.filter((c) => !hidden.has(c.id)) ?? [];
  const hiddenItems = [
    ...(result?.signals.filter((s) => hidden.has(s.id)).map((s) => ({ id: s.id, title: signalTitle(s) })) ?? []),
    ...(result?.correlations.filter((c) => hidden.has(c.id)).map((c) => ({ id: c.id, title: correlationTitle(c) })) ?? []),
  ];

  return (
    <div class="screen">
      <header class="screen-head row center">
        <h1 class="grow">Анализ</h1>
        <button type="button" class="btn btn-small" disabled={busy} onClick={() => void run(true)}>
          {busy ? 'Считаю…' : 'Пересчитать'}
        </button>
      </header>
      <p class="disclaimer">{DISCLAIMER}</p>
      {onOpenReport && (
        <div class="group">
          <button type="button" class="row-btn" onClick={onOpenReport}>
            <IconBadge name="report" tone="report" size={34} />
            <span class="row-main">
              <span class="row-title">Отчёт для врача (A4)</span>
              <span class="row-sub">Сводка и совпадения на одном листе, PDF</span>
            </span>
            <Icon name="chevron" size={16} class="chev" />
          </button>
        </div>
      )}

      {symptoms && symptoms.length > 0 && (
        <section class="why-card">
          <span class="card-title">
            <IconBadge name="symptom" tone="symptom" size={30} /> Почему так?
          </span>
          <span class="muted small">Выбери симптом — покажу, что раньше чаще всего было перед ним (по часам).</span>
          <div class="chips">
            {symptoms.map((s) => (
              <button type="button" key={s.id} class="chip" onClick={() => setWhyId(s.id)}>
                {s.name} <span class="muted">{s.n}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {whyId && <WhyPanel symptomId={whyId} onClose={() => setWhyId(null)} />}

      {!result && busy && <p class="muted">Считаю…</p>}

      {result && !result.enough && (
        <section class="panel">
          <h2>Прогресс данных</h2>
          <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={MIN_COMPLETED_DAYS} aria-valuenow={result.completedDays}>
            <div style={{ width: `${Math.min(100, (result.completedDays / MIN_COMPLETED_DAYS) * 100)}%` }} />
          </div>
          <p>
            Заполнено дней: {result.completedDays} из {MIN_COMPLETED_DAYS}. Нужно ещё {result.needMore}. Выводы пока не
            показываются: на малом числе дней почти любое совпадение случайно.
          </p>
          <p class="muted small">
            Считаются только дни с отметкой «День заполнен». Надёжнее всего выводы становятся после 90 заполненных дней.
          </p>
        </section>
      )}

      {result && result.enough && (
        <>
          <p class="muted small">
            Заполненных дней: {result.completedDays}. Проверено пар: {result.testedPairs + result.testedNumeric}.
            {result.rejectedBySeries > 0 && ` Отсеяно как совпадение серий: ${result.rejectedBySeries}.`} Посчитано{' '}
            {new Date(result.computedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}.
          </p>

          <section>
            {result.completedDays < 90 && (
              <div class="progress progress-thin" role="progressbar" aria-label="До надёжных выводов" aria-valuemin={0} aria-valuemax={90} aria-valuenow={result.completedDays}>
                <div style={{ width: `${(result.completedDays / 90) * 100}%` }} />
              </div>
            )}
            {result.completedDays < 90 && (
              <p class="muted small">До более надёжных выводов (90 заполненных дней): ещё {90 - result.completedDays}. Пока данных мало — выводы могут меняться.</p>
            )}
            <h2 class="section-title">Совпадения</h2>
            <p class="muted small">
              Сильный и заметный сигнал — разница большая и повторилась в обеих половинах периода. Слабый — данных мало, связь
              неустойчива или совпадает с другим фактором. Всё это гипотезы.
            </p>
            {visibleSignals.length === 0 && (
              <p class="muted">Устойчивых совпадений пока не найдено. Это нормальный результат — значит, случайных выводов приложение не показывает.</p>
            )}
            <div class="cards">
              {visibleSignals.map((s) => (
                <article key={s.id} class={`insight insight-${s.category}`}>
                  <div class="insight-badges">
                    <span class="badge">{CATEGORY_LABEL[s.category]}</span>
                    <span class="badge badge-outline">гипотеза</span>
                  </div>
                  <h3 class="insight-title">{signalTitle(s)}</h3>
                  <p class="small">{signalDetails(s)}</p>
                  <p class="muted small">
                    Отношение: {rrText(s.rr)} · {fmtQ(s.q)}
                    {!s.replicated && ' · в одной из половин периода не повторилось'}
                  </p>
                  {s.confounds.length > 0 && (
                    <div class="confound" role="note">
                      <p class="small"><b>⚠ Совпадает с другим фактором</b></p>
                      {confoundTexts(s).map((t, i) => (
                        <p key={i} class="small">{t}</p>
                      ))}
                      {s.confounded && <p class="muted small">Поэтому вывод показан как слабый сигнал.</p>}
                    </div>
                  )}
                  {notes[s.id] && <p class="small note">Заметка: {notes[s.id]}</p>}
                  <div class="insight-actions">
                    <button type="button" class="btn btn-small" onClick={() => setShowDates(s)}>
                      Показать дни
                    </button>
                    <button type="button" class="btn btn-small" onClick={() => setNoteFor(s.id)}>
                      Заметка
                    </button>
                    <button type="button" class="btn btn-small" onClick={() => toggleHidden(s.id)}>
                      Скрыть
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {visibleCorr.length > 0 && (
            <section>
              <h2 class="section-title">Связи между показателями</h2>
              <div class="cards">
                {visibleCorr.map((c: Correlation) => (
                  <article key={c.id} class="insight">
                    <div class="insight-badges">
                      <span class="badge badge-outline">гипотеза</span>
                    </div>
                    <h3 class="insight-title">{correlationTitle(c)}</h3>
                    <p class="small">{correlationDetails(c)}</p>
                    {notes[c.id] && <p class="small note">Заметка: {notes[c.id]}</p>}
                    <div class="insight-actions">
                      <button type="button" class="btn btn-small" onClick={() => setNoteFor(c.id)}>
                        Заметка
                      </button>
                      <button type="button" class="btn btn-small" onClick={() => toggleHidden(c.id)}>
                        Скрыть
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {hiddenItems.length > 0 && (
            <section>
              <button type="button" class="btn btn-link" onClick={() => setShowHidden(!showHidden)}>
                {showHidden ? 'Свернуть скрытые выводы' : `Скрытые выводы (${hiddenItems.length})`}
              </button>
              {showHidden && (
                <ul class="list">
                  {hiddenItems.map((h) => (
                    <li key={h.id} class="row center hidden-row">
                      <span class="grow small">{h.title}</span>
                      <button type="button" class="btn btn-small" onClick={() => toggleHidden(h.id)}>
                        Вернуть
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {timeline && <RepeatsCard timeline={timeline} />}

      <details class="panel small">
        <summary>Как это считается</summary>
        <ul>
          <li>Берутся только заполненные дни. Для каждой пары «фактор в день D → состояние через 0, 1, 2 дня» строится таблица совпадений.</li>
          <li>Точный критерий Фишера и поправка Бенджамини–Хохберга на число проверенных пар (q — ожидаемая доля ложных находок).</li>
          <li>Проверка перемешиванием: если совпадение объясняется тем, что хорошие и плохие дни идут сериями, вывод отсеивается.</li>
          <li>«Заметный» и «сильный» сигнал должен повторяться в обеих половинах периода.</li>
          <li>Если фактор часто бывает в те же дни, что и другой (коэффициент phi ≥ 0,5), показывается предупреждение и пересчёт отдельно в днях с другим фактором и без него (объединённое отношение Мантеля–Хензеля). Если разделить нельзя, вывод остаётся слабым сигналом.</li>
          <li>Обратная связь возможна: например, лекарство могли принять из-за боли, а не наоборот.</li>
        </ul>
      </details>

      <section class="panel warn small">
        <h2>Когда не ждать</h2>
        <p>
          Сильная боль, резкое ухудшение, температура, одышка, боль в груди, спутанность сознания, любые тревожащие симптомы —
          не вести дневник, а срочно обратиться к врачу или вызвать скорую (103 или 112).
        </p>
      </section>

      {showDates && (
        <Sheet title="Дни совпадений" onClose={() => setShowDates(null)}>
          <p class="small">{signalTitle(showDates)}</p>
          <ul class="list small">
            {showDates.dates.map((d) => (
              <li key={d}>{formatDateRu(d)}</li>
            ))}
          </ul>
        </Sheet>
      )}
      {noteFor && (
        <NoteEditor
          initial={notes[noteFor] ?? ''}
          onClose={() => setNoteFor(null)}
          onSave={(text) => {
            const next = { ...notes };
            if (text.trim()) next[noteFor] = text.trim();
            else delete next[noteFor];
            void safe(() => updateSettings(db, { insightNotes: next }));
            setNoteFor(null);
          }}
        />
      )}
    </div>
  );
}

function NoteEditor({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (t: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <Sheet
      title="Заметка к выводу"
      onClose={onClose}
      footer={
        <button type="button" class="btn btn-primary btn-block" onClick={() => onSave(text)}>
          Сохранить
        </button>
      }
    >
      <textarea rows={4} value={text} maxLength={500} onInput={(e) => setText(e.currentTarget.value)} placeholder="Например: обсудить с врачом" />
    </Sheet>
  );
}
