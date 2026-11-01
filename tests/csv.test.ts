import { describe, it, expect } from 'vitest';
import { buildCsvFiles, cell } from '../src/lib/csv';
import type { BackupFile } from '../src/lib/backup';
import { DEFAULT_SETTINGS } from '../src/db/defaults';

describe('CSV', () => {
  it('ячейки: кавычки, точка с запятой, перенос строки, формулы, числа с запятой', () => {
    expect(cell('просто текст')).toBe('просто текст');
    expect(cell('a;b')).toBe('"a;b"');
    expect(cell('сказала "да"')).toBe('"сказала ""да"""');
    expect(cell('строка\nвторая')).toBe('"строка\nвторая"');
    expect(cell('=1+1')).toBe("'=1+1");
    expect(cell('-тест')).toBe("'-тест");
    expect(cell(58.4)).toBe('58,4');
    expect(cell(true)).toBe('да');
    expect(cell(undefined)).toBe('');
  });

  it('пять файлов, BOM, заголовки, вымышленные строки', () => {
    const b: BackupFile = {
      app: 'wellbeing-diary', format: 2, dataVersion: 3, appVersion: 't', exportedAt: 0, settings: { ...DEFAULT_SETTINGS },
      items: [{ id: 'f', kind: 'food', name: 'тест-каша', tags: ['глютен', 'тест'], favorite: true, archived: false, useCount: 0, createdAt: 0 }],
      days: [{ date: '2026-11-01', completed: true, updatedAt: 0, sleep: { durationMin: 420 }, stool: { count: 1, type: 4 }, note: 'день; хороший' }],
      events: [{ id: 'e', date: '2026-11-01', ts: Date.parse('2026-11-01T08:15:00+03:00'), itemId: 'f', kind: 'food', amountText: '200 г' }],
      courses: [], metrics: [{ id: 'w', name: 'Вес', unit: 'кг', archived: false, createdAt: 0 }],
      measurements: [{ id: 'm', metricId: 'w', date: '2026-11-01', ts: 0, value: 58.4 }],
    };
    const files = buildCsvFiles(b);
    expect(files.map((f) => f.name)).toEqual(['zapisi.csv', 'dni.csv', 'pokazateli.csv', 'kursy.csv', 'spravochnik.csv']);
    for (const f of files) expect(f.text.startsWith('﻿')).toBe(true);
    const rows = (name: string) => files.find((f) => f.name === name)!.text.slice(1).trim().split('\r\n');
    expect(rows('zapisi.csv')[1]).toBe('2026-11-01;08:15;Еда;тест-каша;;200 г;');
    expect(rows('dni.csv')[1]).toBe('2026-11-01;да;;;420;;;;;;;1;4;"день; хороший"');
    expect(rows('pokazateli.csv')[1]).toBe('2026-11-01;Вес;58,4;кг;;;');
    expect(rows('spravochnik.csv')[1]).toBe('Еда;тест-каша;глютен, тест;да;нет');
  });
});
