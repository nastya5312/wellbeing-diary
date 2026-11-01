// Отрисовка блоков отчёта на canvas размера A4 (чёрное на белом) и сборка PDF.
import type { Block } from './reportBlocks';
import { jpegPagesToPdf } from './pdf';

const W = 1654; // A4 при 200 dpi
const H = 2339;
const M = 94; // поля 12 мм
const FONT = '-apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif';

type Ctx = CanvasRenderingContext2D;

function wrap(ctx: Ctx, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Нарисовать (или только измерить при draw = false). Возвращает высоту. */
function layout(ctx: Ctx, blocks: Block[], size: number, draw: boolean): number {
  const lh = Math.round(size * 1.32);
  const inner = W - 2 * M;
  let y = M;
  const font = (weight: string, px: number, style = '') => (ctx.font = `${style} ${weight} ${px}px ${FONT}`.trim());
  for (const b of blocks) {
    if (b.t === 'title') {
      font('700', Math.round(size * 1.35));
      y += Math.round(size * 1.35);
      if (draw) ctx.fillText(b.text, M, y);
      y += Math.round(size * 0.45);
    } else if (b.t === 'h') {
      font('700', Math.round(size * 1.05));
      y += Math.round(size * 0.75) + Math.round(size * 1.05);
      if (draw) {
        ctx.fillText(b.text, M, y);
        ctx.fillRect(M, y + Math.round(size * 0.3), inner, 2);
      }
      y += Math.round(size * 0.5);
    } else if (b.t === 'p') {
      font('400', size, b.italic ? 'italic' : '');
      ctx.fillStyle = b.muted ? '#444' : '#000';
      if (b.italic) y += Math.round(size * 0.6);
      for (const line of wrap(ctx, b.text, inner)) {
        y += lh;
        if (draw) ctx.fillText(line, M, y);
      }
      ctx.fillStyle = '#000';
    } else if (b.t === 'li') {
      font('400', size);
      const indent = Math.round(size * 1.6);
      wrap(ctx, b.text, inner - indent).forEach((line, i) => {
        y += lh;
        if (draw) {
          if (i === 0) ctx.fillText(`${b.n}.`, M, y);
          ctx.fillText(line, M + indent, y);
        }
      });
      y += Math.round(size * 0.2);
    } else {
      font('400', size);
      const c1 = ctx.measureText(b.cols[1]).width;
      const c2 = ctx.measureText(b.cols[2]).width;
      const gap = size;
      const nameW = Math.max(inner * 0.35, inner - c1 - c2 - 2 * gap - (c2 ? 0 : 0));
      const lines = wrap(ctx, b.cols[0], nameW);
      lines.forEach((line, i) => {
        y += lh;
        if (draw) {
          ctx.fillText(line, M, y);
          if (i === 0) {
            ctx.textAlign = 'right';
            ctx.fillText(b.cols[2], W - M, y);
            ctx.fillText(b.cols[1], W - M - (c2 ? c2 + gap : 0), y);
            ctx.textAlign = 'left';
          }
        }
      });
      if (draw) {
        ctx.fillStyle = '#bbb';
        ctx.fillRect(M, y + Math.round(size * 0.35), inner, 1);
        ctx.fillStyle = '#000';
      }
      y += Math.round(size * 0.35);
    }
  }
  return y + M;
}

/** Холст A4 с отчётом. Шрифт уменьшается, пока всё не поместится на один лист. */
export function renderReportCanvas(blocks: Block[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Не удалось подготовить PDF: рисование недоступно');
  let size = 30;
  while (size > 16 && layout(ctx, blocks, size, false) > H) size -= 1;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'alphabetic';
  layout(ctx, blocks, size, true);
  return canvas;
}

export async function reportPdf(blocks: Block[]): Promise<Blob> {
  const canvas = renderReportCanvas(blocks);
  const jpegBlob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось подготовить PDF'))), 'image/jpeg', 0.9),
  );
  const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
  const pdf = jpegPagesToPdf([{ jpeg, width: W, height: H }]);
  return new Blob([pdf], { type: 'application/pdf' });
}
