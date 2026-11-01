// Даты и граница дня. Всё считается в часовом поясе устройства (у Насти — Минск).
// Календарные операции над 'YYYY-MM-DD' делаются через UTC, чтобы переходы на летнее время не сдвигали дни.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isDateString(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isTimeString(s: string): boolean {
  return TIME_RE.test(s);
}

/** 'HH:MM' → минуты от полуночи. */
export function timeToMinutes(hhmm: string): number {
  const m = TIME_RE.exec(hhmm);
  if (!m) throw new Error(`Неверное время: ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Минуты от полуночи → 'HH:MM'. */
export function minutesToTime(min: number): string {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Локальная календарная дата момента времени, без учёта границы дня. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Время 'HH:MM' момента по часам устройства. */
export function localTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Сдвиг даты 'YYYY-MM-DD' на n дней (n может быть отрицательным). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Число дней от a до b (b − a). */
export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/**
 * Дата дневника для момента ts с учётом границы дня.
 * Пример: граница 04:00, событие в 02:30 2 ноября → относится к 1 ноября.
 */
export function diaryDate(ts: number, dayStartsAt: string): string {
  const d = new Date(ts);
  const minutes = d.getHours() * 60 + d.getMinutes();
  const date = localDate(d);
  return minutes < timeToMinutes(dayStartsAt) ? addDays(date, -1) : date;
}

/**
 * Длительность сна в минутах с учётом перехода через полночь.
 * 23:30 → 07:15 = 465 мин. Одинаковое время «лёг» и «встал» считается нулём.
 */
export function sleepDurationMin(bedtime: string, wake: string): number {
  return (timeToMinutes(wake) - timeToMinutes(bedtime) + 1440) % 1440;
}

/** День недели по-русски для даты 'YYYY-MM-DD'. */
export function weekdayRu(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const names = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  return names[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]!;
}
