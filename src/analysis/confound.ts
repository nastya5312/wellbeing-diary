// Проверка совпадающих факторов (ТЗ, 7.7): если фактор F часто бывает в те же дни, что и G,
// по одним совпадениям нельзя сказать, с чем из них связан результат.
import type { BinaryVar, Value } from './factors';
import { buildTable, phi, riskRatio, type Table2x2 } from './tables';
import { MAX_CONFOUNDS, MIN_STRATUM_F_DAYS, PHI_CONFOUND } from './thresholds';

export type Stratum = Table2x2 & { rr: number | null };

export type Confound = {
  gId: string;
  gLabel: string;
  phi: number;
  /** Дней, когда F и G были вместе */
  both: number;
  /** Дней с F (где G известно) */
  fDays: number;
  /** F ни разу не было без G — разделить невозможно */
  inseparable: boolean;
  /** Дней с F без G (если их 1–2, разделить пока нельзя) */
  fWithoutG: number;
  /** Пересчёт отдельно в днях с G и без G; null — дней не хватает */
  strata: { withG: Stratum; withoutG: Stratum; mh: number | null } | null;
};

/** Фактор, собранный из тех же позиций (тег и его продукт, курс и сама позиция), — не «другой» фактор. */
export function related(f: BinaryVar, g: BinaryVar): boolean {
  if (!f.members || !g.members) return false;
  const fs = new Set(f.members);
  const gs = new Set(g.members);
  return f.members.every((m) => gs.has(m)) || g.members.every((m) => fs.has(m));
}

/** Объединённое отношение рисков Мантеля–Хензеля по стратам. */
export function mantelHaenszelRR(strata: Table2x2[]): number | null {
  let num = 0;
  let den = 0;
  for (const t of strata) {
    const n = t.a + t.b + t.c + t.d;
    if (n === 0) continue;
    num += (t.a * (t.c + t.d)) / n;
    den += (t.c * (t.a + t.b)) / n;
  }
  if (den === 0) return num > 0 ? Infinity : null;
  return num / den;
}

/** Ряд F, оставленный только в днях, где G равно wanted. */
function stratum(f: Value[], g: Value[], wanted: boolean): Value[] {
  return f.map((x, i) => (g[i] === wanted ? x : undefined));
}

export function findConfounds(f: BinaryVar, o: BinaryVar, lag: number, all: BinaryVar[]): Confound[] {
  const found: Confound[] = [];
  for (const g of all) {
    if (g.id === f.id || related(f, g)) continue;
    const ph = phi(f.values, g.values);
    if (ph.phi === null || ph.phi < PHI_CONFOUND) continue;
    let fDays = 0;
    let fWithoutG = 0;
    f.values.forEach((x, i) => {
      if (x !== true || g.values[i] === undefined) return;
      fDays++;
      if (g.values[i] === false) fWithoutG++;
    });
    const withG = buildTable(stratum(f.values, g.values, true), o.values, lag);
    const withoutG = buildTable(stratum(f.values, g.values, false), o.values, lag);
    const enough = withG.a + withG.b >= MIN_STRATUM_F_DAYS && withoutG.a + withoutG.b >= MIN_STRATUM_F_DAYS;
    found.push({
      gId: g.id,
      gLabel: g.label,
      phi: ph.phi,
      both: ph.both,
      fDays,
      inseparable: fWithoutG === 0,
      fWithoutG,
      strata: enough
        ? {
            withG: { ...withG, rr: riskRatio(withG) },
            withoutG: { ...withoutG, rr: riskRatio(withoutG) },
            mh: mantelHaenszelRR([withG, withoutG]),
          }
        : null,
    });
  }
  return found.sort((x, y) => y.phi - x.phi).slice(0, MAX_CONFOUNDS);
}
