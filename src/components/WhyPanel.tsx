import { useEffect, useState } from 'preact/hooks';
import { getDb } from '../db/schema';
import { getSettings } from '../db/repo';
import { explainSymptom, WHY, type WhyResult } from '../analysis/why';
import { CATEGORY_LABEL, DISCLAIMER, hoursAgoText, whyBackgroundText, whyDetails, whyTitle } from '../analysis/texts';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import { formatDateLong, localTime } from '../lib/dates';
import { safe } from '../lib/notify';

const ratioText = (r: number) => (r === Infinity ? 'раньше в эти часы не бывало' : `в ${r.toFixed(1).replace('.', ',')} раза чаще`);

// «Почему так?»: что было перед симптомом и что раньше чаще всего ему предшествовало.
export function WhyPanel({ symptomId, focusTs, onClose }: { symptomId: string; focusTs?: number; onClose: () => void }) {
  const [res, setRes] = useState<WhyResult | null>(null);

  useEffect(() => {
    let alive = true;
    void safe(async () => {
      const db = getDb();
      const [events, items, days, settings] = await Promise.all([db.events.toArray(), db.items.toArray(), db.days.toArray(), getSettings(db)]);
      // Дать окну открыться, потом считать
      await new Promise((r) => setTimeout(r, 30));
      const r = explainSymptom({ events, items, days, settings }, symptomId, focusTs);
      if (alive) setRes(r);
    });
    return () => {
      alive = false;
    };
  }, [symptomId, focusTs]);

  const name = res?.symptomName ?? '';
  return (
    <Sheet title="Почему так?" onClose={onClose}>
      {!res && <p class="muted">Считаю…</p>}
      {res && (
        <div class="why">
          <h2 class="why-symptom">{name}</h2>

          {res.focus && (
            <section class="stack" style={{ marginTop: 0 }}>
              <h3>
                Что было перед этим разом — {formatDateLong(res.focus.date)}, {localTime(res.focus.ts)}
              </h3>
              {res.focus.present.length === 0 ? (
                <p class="muted small">За 48 часов до этого записей нет.</p>
              ) : (
                <div class="group">
                  {res.focus.present.map((p) => (
                    <div key={p.itemId} class="row-btn why-row">
                      <span class="ev-time">{p.time}</span>
                      <span class="row-main">
                        <span class="row-title">{p.label}</span>
                        <span class="row-sub">
                          {hoursAgoText(p.hoursBefore)}
                          {p.candidate && (
                            <>
                              {' · '}
                              <b class={`why-tag why-${p.candidate.strength}`}>совпадает: {ratioText(p.candidate.ratio)}</b>
                            </>
                          )}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section class="stack">
            <h3>Что раньше чаще бывало перед «{name}»</h3>
            {!res.enough ? (
              <div class="panel">
                <p>
                  Эпизодов в заполненные дни: {res.usable} из нужных {WHY.minEpisodes}. Пока сравнивать не с чем — список выше
                  просто показывает, что было.
                </p>
                <p class="muted small">Отмечай «{name}» с силой и временем и нажимай «День заполнен» — тогда разбор начнёт находить повторы.</p>
              </div>
            ) : res.candidates.length === 0 ? (
              <div class="panel">
                <p>Устойчивых совпадений по времени не найдено ({res.usable} эпизодов, проверено вариантов: {res.tested}).</p>
                <p class="muted small">Это тоже результат: ничего из записанного не повторяется перед «{name}» чаще обычного.</p>
              </div>
            ) : (
              res.candidates.map((c) => (
                <article key={c.exposureId + c.windowId} class={`insight insight-${c.strength}`}>
                  <div class="insight-badges">
                    <span class="badge">{CATEGORY_LABEL[c.strength]}</span>
                    <span class="badge badge-outline">гипотеза</span>
                  </div>
                  <h3 class="insight-title">{whyTitle(c, name)}</h3>
                  <p class="small">{whyDetails(c)}</p>
                  {c.mostlyWith && (
                    <p class="confound small">
                      Чаще всего был вместе с «{c.mostlyWith}». Без него совпадений почти не остаётся — возможно, дело не в
                      этом факторе.
                    </p>
                  )}
                  {c.together && (
                    <p class="confound small">
                      Почти всегда вместе с «{c.together}» — по записям их не разделить.
                    </p>
                  )}
                </article>
              ))
            )}
          </section>

          {res.background.length > 0 && (
            <section class="stack">
              <h3>Фон дня</h3>
              {res.background.map((b) => (
                <p key={b.id} class="panel small">
                  {whyBackgroundText(b, name)}
                </p>
              ))}
            </section>
          )}

          <details class="panel small" style={{ marginTop: '14px' }}>
            <summary>Как это считается</summary>
            <ul>
              <li>Каждый раз, когда был «{name}», смотрю, что было за 0–6 часов, 6–24 часа и 1–2 суток до него.</li>
              <li>
                Сравниваю с теми же часами в другие дни (±60 дней), когда «{name}» не было. Так твой обычный распорядок — например,
                кофе каждое утро — не выглядит подозрительным.
              </li>
              <li>Точный расчёт вероятности и поправка на число проверенных вариантов. Учитываются только заполненные дни.</li>
              <li>Записи задним числом получают время 12:00 — если время важно, поправь его в записи.</li>
            </ul>
          </details>
          <p class="disclaimer" style={{ marginTop: '12px' }}>
            <Icon name="alert" size={18} /> {DISCLAIMER}
          </p>
        </div>
      )}
    </Sheet>
  );
}
