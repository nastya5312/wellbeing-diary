import { describe, it, expect } from 'vitest';
import {
  addDays, daysBetween, diaryDate, isDateString, isTimeString, localDate, minutesToTime,
  sleepDurationMin, timeToMinutes, weekdayRu,
} from '../src/lib/dates';

// Тесты запускаются с TZ=Europe/Minsk (см. package.json)
const at = (iso: string) => new Date(iso).getTime(); // строка без пояса = локальное время

describe('часовой пояс тестов', () => {
  it('Минск, UTC+3', () => {
    expect(new Date('2026-11-01T12:00:00').getTimezoneOffset()).toBe(-180);
  });
});

describe('граница дня', () => {
  it('событие до 04:00 относится к предыдущей дате', () => {
    expect(diaryDate(at('2026-11-02T02:30:00'), '04:00')).toBe('2026-11-01');
    expect(diaryDate(at('2026-11-02T03:59:00'), '04:00')).toBe('2026-11-01');
  });
  it('ровно в 04:00 и позже — текущая дата', () => {
    expect(diaryDate(at('2026-11-02T04:00:00'), '04:00')).toBe('2026-11-02');
    expect(diaryDate(at('2026-11-02T23:59:00'), '04:00')).toBe('2026-11-02');
  });
  it('граница 00:00 — обычные календарные сутки', () => {
    expect(diaryDate(at('2026-11-02T00:10:00'), '00:00')).toBe('2026-11-02');
  });
  it('переход через месяц и год', () => {
    expect(diaryDate(at('2027-01-01T01:00:00'), '04:00')).toBe('2026-12-31');
    expect(diaryDate(at('2026-03-01T01:00:00'), '04:00')).toBe('2026-02-28');
  });
});

describe('сон через полночь', () => {
  it('23:30 → 07:15 = 7 ч 45 мин', () => expect(sleepDurationMin('23:30', '07:15')).toBe(465));
  it('01:00 → 09:00 = 8 ч', () => expect(sleepDurationMin('01:00', '09:00')).toBe(480));
  it('22:00 → 22:00 = 0', () => expect(sleepDurationMin('22:00', '22:00')).toBe(0));
  it('дневной сон 14:00 → 15:30', () => expect(sleepDurationMin('14:00', '15:30')).toBe(90));
});

describe('операции с датами', () => {
  it('addDays через границы месяцев, високосный год', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('addDays считает по календарю, без учёта переходов времени', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
  });
  it('daysBetween', () => {
    expect(daysBetween('2026-11-01', '2026-11-08')).toBe(7);
    expect(daysBetween('2026-11-08', '2026-11-01')).toBe(-7);
  });
  it('localDate и weekdayRu', () => {
    expect(localDate(new Date('2026-11-01T12:00:00'))).toBe('2026-11-01');
    expect(weekdayRu('2026-11-01')).toBe('воскресенье');
  });
  it('проверка форматов', () => {
    expect(isDateString('2026-02-29')).toBe(false);
    expect(isDateString('2028-02-29')).toBe(true);
    expect(isDateString('2026-1-1')).toBe(false);
    expect(isTimeString('04:00')).toBe(true);
    expect(isTimeString('24:00')).toBe(false);
  });
  it('минуты ↔ ЧЧ:ММ', () => {
    expect(timeToMinutes('07:15')).toBe(435);
    expect(minutesToTime(435)).toBe('07:15');
    expect(minutesToTime(-30)).toBe('23:30');
    expect(() => timeToMinutes('7:5')).toThrow();
  });
});
