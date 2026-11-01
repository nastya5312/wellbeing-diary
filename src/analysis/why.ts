// «Почему так?» — разбор симптома по часам (схема «случай — свой же контроль»).
//
// Для каждого эпизода симптома (момент t) смотрим окна до него: 0–6 ч, 6–24 ч, 24–48 ч.
// Контроль — те же часы в другие дни (t ± k суток, |k| ≤ 60), когда симптома не было.
// Так обычный распорядок (кофе каждое утро) не выглядит «подозрительным»: в контрольные дни он тоже есть.
// Для каждого фактора: наблюдалось O эпизодов с фактором в окне, ожидалось E = Σ доля контрольных дней
// с фактором в то же время. p — точный хвост пуассон-биномиального распределения, затем поправка
// Бенджамини–Хохберга. Учитываются только заполненные дни (ТЗ, 7.1). Это совпадения, не доказательство.
import type { Day, DiaryEvent, Item, Settings } from '../models/types';
import { diaryDate, localTime } from '../lib/dates';
import { benjaminiHochberg } from './fdr';
import { fisherExact } from './fisher';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const WHY = {
  /** Эпизоды ближе этого интервала — один эпизод */
  episodeGapH: 12,
  /** Контрольные дни: ±60 суток от эпизода */
  refRangeDays: 60,
  /** Минимум контрольных окон на эпизод */
  minRefs: 5,
  /** Минимум эпизодов для выводов */
  minEpisodes: 5,
  weak: { q: 0.25, ratio: 1.5, o: 3 },
  // Пороги подобраны симуляцией (как в основном анализе): на независимых данных «заметный» — ~1,5% наборов
  notable: { q: 0.02, ratio: 2, o: 4 },
  strong: { q: 0.005, ratio: 3, o: 5 },
  /** «Почти всегда вместе»: доля общих эпизодов */
  together: 0.8,
} as const;

export const WINDOWS = [
  { id: 'h0', fromH: 0, toH: 6, label: 'за 0–6 ч до' },
  { id: 'h6', fromH: 6, toH: 24, label: 'за 6–24 ч до' },
  { id: 'h24', fromH: 24, toH: 48, label: 'за 1–2 суток до' },
] as const;
export type WindowId = (typeof WINDOWS)[number]['id'];

export type WhyInput = { events: DiaryEvent[]; items: Item[]; days: Day[]; settings: Settings; now?: number };

export type Strength = 'weak' | 'notable' | 'strong';

export type WhyCandidate = {
  exposureId: string;
  label: string;
  windowId: WindowId;
  windowLabel: string;
  /** Эпизодов с фактором в окне */
  observed: number;
  /** Ожидалось при обычном распорядке */
  expected: number;
  /** Эпизодов, где окно целиком в заполненных днях */
  cases: number;
  ratio: number; // Infinity — в такое время раньше не бывало
  p: number;
  q: number;
  strength: Strength;
  /** Другой фактор, который почти всегда был вместе с этим */
  together?: string;
  /** Более сильный фактор, без которого совпадений почти не остаётся */
  mostlyWith?: string;
};

export type WhyBackground = { id: string; label: string; withSymptom: number; episodeDays: number; other: number; otherDays: number; p: number; q: number };

export type WhyPresent = { itemId: string; label: string; ts: number; time: string; hoursBefore: number; candidate?: WhyCandidate };

export type WhyResult = {
  symptomId: string;
  symptomName: string;
  episodes: number;
  /** Эпизодов в заполненные дни (идут в расчёт) */
  usable: number;
  enough: boolean;
  tested: number;
  candidates: WhyCandidate[];
  background: WhyBackground[];
  /** Разбор выбранного (или последнего) эпизода: что было за 48 ч до него */
  focus?: { ts: number; date: string; present: WhyPresent[] };
};

type Exposure = { id: string; label: string; itemIds: Set<string>; times: number[] };

/** Индекс первого элемента ≥ x в отсортированном массиве. */
function lowerBound(a: number[], x: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** P(X ≥ k), X — сумма независимых Бернулли с вероятностями ps. */
export function poissonBinomialUpper(ps: number[], k: number): number {
  if (k <= 0) return 1;
  let dist = [1];
  for (const p of ps) {
    const next = new Array<number>(dist.length + 1).fill(0);
    for (let j = 0; j < dist.length; j++) {
      next[j]! += dist[j]! * (1 - p);
      next[j + 1]! += dist[j]! * p;
    }
    dist = next;
  }
  let s = 0;
  for (let j = k; j < dist.length; j++) s += dist[j]!;
  return Math.min(1, Math.max(0, s));
}

/** Эпизоды симптома: отметки с силой ≥ порога; отметки ближе 12 ч к началу эпизода — тот же эпизод. */
export function symptomEpisodes(events: DiaryEvent[], symptomId: string, minIntensity: number): number[] {
  const ts = events
    .filter((e) => e.itemId === symptomId && (e.intensity ?? minIntensity) >= minIntensity)
    .map((e) => e.ts)
    .sort((a, b) => a - b);
  const out: number[] = [];
  for (const t of ts) if (!out.length || t - out[out.length - 1]! >= WHY.episodeGapH * HOUR) out.push(t);
  return out;
}

function buildExposures(events: DiaryEvent[], items: Item[]): Exposure[] {
  const itemBy = new Map(items.map((it) => [it.id, it]));
  const byItem = new Map<string, number[]>();
  for (const e of events) {
    if (e.kind === 'symptom') continue;
    byItem.set(e.itemId, [...(byItem.get(e.itemId) ?? []), e.ts]);
  }
  const out: Exposure[] = [];
  const tags = new Map<string, Set<string>>();
  for (const [id, times] of byItem) {
    const it = itemBy.get(id);
    if (!it) continue;
    out.push({ id: `item:${id}`, label: it.name, itemIds: new Set([id]), times: times.sort((a, b) => a - b) });
    for (const t of it.tags) tags.set(t, (tags.get(t) ?? new Set()).add(id));
  }
  for (const [tag, ids] of tags) {
    if (ids.size < 2) continue;
    const times = [...ids].flatMap((id) => byItem.get(id) ?? []).sort((a, b) => a - b);
    out.push({ id: `tag:${tag}`, label: `тег «${tag}»`, itemIds: ids, times });
  }
  return out;
}

export function explainSymptom(input: WhyInput, symptomId: string, focusTs?: number): WhyResult {
  const { events, items, days, settings } = input;
  const now = input.now ?? Date.now();
  const itemBy = new Map(items.map((it) => [it.id, it]));
  const symptomName = itemBy.get(symptomId)?.name ?? 'симптом';
  const completed = new Set(days.filter((d) => d.completed).map((d) => d.date));
  const dayStart = settings.dayStartsAt;
  const dd = (ts: number) => diaryDate(ts, dayStart);

  const episodes = symptomEpisodes(events, symptomId, settings.symptomMinIntensity);
  // Дни с любой отметкой симптома — не годятся как контроль
  const symptomDays = new Set(events.filter((e) => e.itemId === symptomId).map((e) => e.date));

  /** Окно [t − to, t − from) целиком в заполненных днях? */
  const windowOk = (t: number, fromH: number, toH: number) => {
    const start = t - toH * HOUR;
    const end = t - fromH * HOUR - 1;
    for (let x = start; ; x += 12 * HOUR) {
      if (!completed.has(dd(Math.min(x, end)))) return false;
      if (x >= end) return true;
    }
  };
  const exposed = (exp: Exposure, t: number, fromH: number, toH: number) => {
    const lo = t - toH * HOUR;
    const hi = t - fromH * HOUR; // строго раньше (порядок внутри одного момента неизвестен)
    const i = lowerBound(exp.times, lo);
    return i < exp.times.length && exp.times[i]! < hi;
  };

  const exposures = buildExposures(events, items);
  const usable = episodes.filter((t) => completed.has(dd(t))).length;
  const result: WhyResult = {
    symptomId,
    symptomName,
    episodes: episodes.length,
    usable,
    enough: usable >= WHY.minEpisodes,
    tested: 0,
    candidates: [],
    background: [],
  };

  // ---------- Сравнение по окнам ----------
  type Test = { exp: Exposure; w: (typeof WINDOWS)[number]; o: number; e: number; n: number; p: number; casesWith: Set<number> };
  const tests: Test[] = [];
  if (result.enough) {
    for (const w of WINDOWS) {
      // Для каждого эпизода — список контрольных моментов с полностью заполненным окном
      const caseRefs: { t: number; refs: number[] }[] = [];
      for (const t of episodes) {
        if (!windowOk(t, w.fromH, w.toH) || !completed.has(dd(t))) continue;
        const refs: number[] = [];
        for (let k = -WHY.refRangeDays; k <= WHY.refRangeDays; k++) {
          if (k === 0) continue;
          const r = t + k * DAY;
          if (r > now) continue;
          const rd = dd(r);
          if (!completed.has(rd) || symptomDays.has(rd)) continue;
          if (!windowOk(r, w.fromH, w.toH)) continue;
          refs.push(r);
        }
        if (refs.length >= WHY.minRefs) caseRefs.push({ t, refs });
      }
      if (caseRefs.length < WHY.minEpisodes) continue;
      for (const exp of exposures) {
        let o = 0;
        let e = 0;
        const ps: number[] = [];
        const casesWith = new Set<number>();
        caseRefs.forEach(({ t, refs }) => {
          const pi = refs.filter((r) => exposed(exp, r, w.fromH, w.toH)).length / refs.length;
          ps.push(pi);
          e += pi;
          if (exposed(exp, t, w.fromH, w.toH)) {
            o++;
            casesWith.add(t);
          }
        });
        if (o === 0 && e < 1) continue; // фактора в этих окнах практически не бывает
        tests.push({ exp, w, o, e, n: caseRefs.length, p: poissonBinomialUpper(ps, o), casesWith });
      }
    }
  }
  result.tested = tests.length;
  const qs = benjaminiHochberg(tests.map((t) => t.p));
  const picked: (WhyCandidate & { _cases: Set<number>; _items: Set<string> })[] = [];
  tests.forEach((t, i) => {
    const q = qs[i]!;
    const ratio = t.e > 0 ? t.o / t.e : t.o > 0 ? Infinity : 0;
    const level = (c: { q: number; ratio: number; o: number }) => q <= c.q && ratio >= c.ratio && t.o >= c.o;
    const strength: Strength | null = level(WHY.strong) ? 'strong' : level(WHY.notable) ? 'notable' : level(WHY.weak) ? 'weak' : null;
    if (!strength) return;
    picked.push({
      exposureId: t.exp.id,
      label: t.exp.label,
      windowId: t.w.id,
      windowLabel: t.w.label,
      observed: t.o,
      expected: t.e,
      cases: t.n,
      ratio,
      p: t.p,
      q,
      strength,
      _cases: t.casesWith,
      _items: t.exp.itemIds,
    });
  });

  // Тег, который ничего не добавляет к своему продукту в том же окне, — не показываем
  const kept = picked.filter((c) => {
    if (!c.exposureId.startsWith('tag:')) return true;
    return !picked.some((o) => o.exposureId.startsWith('item:') && o.windowId === c.windowId && c._items.has(o.exposureId.slice(5)) && o.observed >= c.observed * 0.8);
  });
  // Один фактор — одно (самое сильное) окно
  const rank: Record<Strength, number> = { strong: 0, notable: 1, weak: 2 };
  kept.sort((a, b) => rank[a.strength] - rank[b.strength] || a.q - b.q || b.ratio - a.ratio);
  const seen = new Set<string>();
  const unique = kept.filter((c) => (seen.has(c.exposureId) ? false : (seen.add(c.exposureId), true)));
  // «Почти всегда вместе»: по эпизодам в том же окне
  for (const c of unique) {
    const other = unique.find(
      (o) =>
        o !== c &&
        o.windowId === c.windowId &&
        ![...o._items].some((id) => c._items.has(id)) &&
        [...c._cases].filter((x) => o._cases.has(x)).length >= WHY.together * Math.max(c._cases.size, o._cases.size),
    );
    if (other) c.together = other.label;
  }
  // Более слабый кандидат, который почти всегда шёл вместе с более сильным: без него совпадений мало
  unique.forEach((c, i) => {
    if (c.together) return;
    for (const stronger of unique.slice(0, i)) {
      if ([...stronger._items].some((id) => c._items.has(id))) continue;
      const alone = [...c._cases].filter((t) => !stronger._cases.has(t)).length;
      if (alone < WHY.weak.o && c._cases.size - alone >= 2) {
        c.mostlyWith = stronger.label;
        // Отделить от более сильного нельзя — не выше слабого сигнала
        c.strength = 'weak';
        break;
      }
    }
  });
  result.candidates = unique.map(({ _cases: _c, _items: _i, ...c }) => c);

  // ---------- Фон дня: месячные, сон, стресс ----------
  if (result.enough) {
    const dayBy = new Map(days.map((d) => [d.date, d]));
    const epDays = new Set(episodes.map(dd).filter((d) => completed.has(d)));
    const otherDays = [...completed].filter((d) => !symptomDays.has(d));
    const bg: { id: string; label: string; test: (d: Day | undefined) => boolean | undefined }[] = [
      { id: 'flow', label: 'день месячных', test: (d) => (d ? (d.flow ?? 0) > 0 : undefined) },
      { id: 'short', label: 'короткий сон прошлой ночью', test: (d) => (d?.sleep?.durationMin === undefined ? undefined : d.sleep.durationMin < settings.shortSleepMin) },
      { id: 'poor', label: 'плохой сон (качество 1–2)', test: (d) => (d?.sleep?.quality === undefined ? undefined : d.sleep.quality <= 2) },
      { id: 'stress', label: 'сильный стресс (4–5)', test: (d) => (d?.wellbeing?.stress === undefined ? undefined : d.wellbeing.stress >= 4) },
    ];
    const rows = bg.map((b) => {
      const countIn = (list: Iterable<string>) => {
        let yes = 0;
        let known = 0;
        for (const d of list) {
          const v = b.test(dayBy.get(d));
          if (v === undefined) continue;
          known++;
          if (v) yes++;
        }
        return { yes, known };
      };
      const a = countIn(epDays);
      const o = countIn(otherDays);
      const p = a.known && o.known ? fisherExact(a.yes, a.known - a.yes, o.yes, o.known - o.yes) : 1;
      return { id: b.id, label: b.label, withSymptom: a.yes, episodeDays: a.known, other: o.yes, otherDays: o.known, p };
    });
    const bq = benjaminiHochberg(rows.map((r) => r.p));
    result.background = rows
      .map((r, i) => ({ ...r, q: bq[i]! }))
      .filter((r) => r.withSymptom >= 3 && r.episodeDays > 0 && r.otherDays > 0 && r.q <= WHY.weak.q && r.withSymptom / r.episodeDays >= 1.5 * (r.other / r.otherDays));
  }

  // ---------- Выбранный эпизод: что было за 48 ч до него ----------
  const focusT = focusTs !== undefined ? episodes.filter((t) => t <= focusTs + WHY.episodeGapH * HOUR).pop() ?? episodes[episodes.length - 1] : episodes[episodes.length - 1];
  if (focusT !== undefined) {
    const present: WhyPresent[] = [];
    const lastBy = new Map<string, number>();
    for (const e of events) {
      if (e.kind === 'symptom' || e.ts >= focusT || e.ts < focusT - 48 * HOUR) continue;
      if ((lastBy.get(e.itemId) ?? -Infinity) < e.ts) lastBy.set(e.itemId, e.ts);
    }
    for (const [itemId, ts] of lastBy) {
      const it = itemBy.get(itemId);
      if (!it) continue;
      const hoursBefore = (focusT - ts) / HOUR;
      const w = WINDOWS.find((x) => hoursBefore >= x.fromH && hoursBefore < x.toH);
      const candidate = result.candidates.find(
        (c) => w && c.windowId === w.id && (c.exposureId === `item:${itemId}` || (c.exposureId.startsWith('tag:') && it.tags.includes(c.exposureId.slice(4)))),
      ) ?? result.candidates.find((c) => c.exposureId === `item:${itemId}`);
      present.push({ itemId, label: it.name, ts, time: localTime(ts), hoursBefore, candidate });
    }
    present.sort((a, b) => (a.candidate ? 0 : 1) - (b.candidate ? 0 : 1) || (a.candidate && b.candidate ? rank[a.candidate.strength] - rank[b.candidate.strength] : 0) || a.hoursBefore - b.hoursBefore);
    result.focus = { ts: focusT, date: dd(focusT), present };
  }
  return result;
}
