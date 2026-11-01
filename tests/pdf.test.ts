import { describe, it, expect } from 'vitest';
import { jpegPagesToPdf } from '../src/lib/pdf';
import { reportBlocks } from '../src/lib/reportBlocks';
import { buildReport } from '../src/lib/report';
import { DISCLAIMER, FORBIDDEN_WORDS } from '../src/analysis/texts';

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

describe('PDF из картинки', () => {
  it('структура: заголовок, xref указывает точно на объекты, одна страница A4', () => {
    const fakeJpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const pdf = jpegPagesToPdf([{ jpeg: fakeJpeg, width: 10, height: 14 }]);
    const s = latin1(pdf);
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    const xrefPos = Number(/startxref\n(\d+)/.exec(s)![1]);
    expect(s.slice(xrefPos, xrefPos + 4)).toBe('xref');
    const entries = s.slice(xrefPos).split('\n').slice(3, 8);
    entries.forEach((e, i) => expect(s.slice(Number(e.slice(0, 10)), Number(e.slice(0, 10)) + 8)).toBe(`${i + 1} 0 obj\n`));
    expect(s).toContain('/MediaBox [0 0 595.28 841.89]');
    expect(s).toContain('/Count 1');
    expect(s).toContain('/Length 7 >>');
  });
});

describe('текст отчёта', () => {
  it('без запрещённых слов', () => {
    const d = buildReport({ from: '2026-10-01', to: '2026-10-30', days: [], events: [], items: [], courses: [], metrics: [], measurements: [], shortSleepMin: 360 });
    for (const sig of [null, []] as const) {
      for (const b of reportBlocks(d, sig === null ? null : [...sig], '2026-10-30')) {
        // Обязательная строка ТЗ («…не доказанная причина») проверяется отдельно и разрешена
        const text = ('text' in b ? b.text : b.t === 'row' ? b.cols.join(' ') : '').replace(DISCLAIMER, '');
        for (const w of FORBIDDEN_WORDS) expect(text).not.toMatch(w);
      }
    }
  });
});
