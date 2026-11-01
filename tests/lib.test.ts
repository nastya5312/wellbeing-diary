import { describe, it, expect } from 'vitest';
import { cycleDay } from '../src/lib/cycle';
import { isSimilarName, levenshtein, matchesSearch } from '../src/lib/similar';
import { formatDuration, formatDateLong, localDate, localTime, tsFromDiaryDate } from '../src/lib/dates';

describe('день цикла', () => {
  it('нет данных — null', () => expect(cycleDay([], '2026-11-10')).toBeNull());
  it('первый день месячных = 1', () => {
    expect(cycleDay(['2026-11-10'], '2026-11-10')).toBe(1);
  });
  it('считается от начала последних месячных', () => {
    const flow = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-29', '2026-10-30', '2026-10-31'];
    expect(cycleDay(flow, '2026-11-05')).toBe(8);
  });
  it('один пропущенный день внутри месячных — не новое начало', () => {
    expect(cycleDay(['2026-11-01', '2026-11-03'], '2026-11-04')).toBe(4);
  });
  it('будущие даты не учитываются', () => {
    expect(cycleDay(['2026-11-01', '2026-11-20'], '2026-11-05')).toBe(5);
  });
  it('старше 60 дней — null', () => {
    expect(cycleDay(['2026-08-01'], '2026-11-05')).toBeNull();
  });
});

describe('похожие названия', () => {
  it('регистр, пробелы, ё', () => {
    expect(isSimilarName('Кофе', '  кофе ')).toBe(true);
    expect(isSimilarName('отёки', 'отеки')).toBe(true);
  });
  it('начало слова и опечатка', () => {
    expect(isSimilarName('йогурт', 'йогурты')).toBe(true);
    expect(isSimilarName('шоколад', 'шокалад')).toBe(true);
  });
  it('разные слова не похожи', () => {
    expect(isSimilarName('чай', 'сыр')).toBe(false);
    expect(isSimilarName('кофе', 'кефир')).toBe(false);
  });
  it('левенштейн и поиск', () => {
    expect(levenshtein('кот', 'кит')).toBe(1);
    expect(matchesSearch('Головная боль', 'бол')).toBe(true);
    expect(matchesSearch('Головная боль', '')).toBe(true);
    expect(matchesSearch('Головная боль', 'чай')).toBe(false);
  });
});

describe('время события по дате дневника', () => {
  it('днём — та же календарная дата', () => {
    const ts = tsFromDiaryDate('2026-11-01', '13:20', '04:00');
    expect(localDate(new Date(ts))).toBe('2026-11-01');
    expect(localTime(ts)).toBe('13:20');
  });
  it('ночью до границы — следующие календарные сутки', () => {
    const ts = tsFromDiaryDate('2026-11-01', '02:30', '04:00');
    expect(localDate(new Date(ts))).toBe('2026-11-02');
    expect(localTime(ts)).toBe('02:30');
  });
});

describe('форматы', () => {
  it('длительность', () => {
    expect(formatDuration(465)).toBe('7 ч 45 мин');
    expect(formatDuration(480)).toBe('8 ч');
    expect(formatDuration(40)).toBe('40 мин');
  });
  it('дата словами', () => expect(formatDateLong('2026-11-01')).toBe('1 ноября'));
});
