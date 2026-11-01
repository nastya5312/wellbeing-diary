// Минимальный PDF из одной картинки JPEG на страницу A4 — без библиотек.
// Текст рисуется на canvas системным шрифтом (кириллица работает), картинка вкладывается в PDF как есть (DCTDecode).

const A4_W = 595.28; // пункты
const A4_H = 841.89;

const enc = new TextEncoder();

export function jpegPagesToPdf(pages: { jpeg: Uint8Array; width: number; height: number }[]): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (x: string | Uint8Array) => {
    const b = typeof x === 'string' ? enc.encode(x) : x;
    parts.push(b);
    pos += b.length;
  };
  const obj = (n: number, body: () => void) => {
    offsets[n] = pos;
    push(`${n} 0 obj\n`);
    body();
    push('\nendobj\n');
  };

  // Объекты: 1 каталог, 2 страницы, далее на каждую страницу: страница, картинка, содержимое
  const pageIds = pages.map((_, i) => 3 + i * 3);
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`));
  pages.forEach((p, i) => {
    const pid = pageIds[i]!;
    const content = `q ${A4_W} 0 0 ${A4_H} 0 0 cm /Im0 Do Q`;
    obj(pid, () =>
      push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_W} ${A4_H}] /Resources << /XObject << /Im0 ${pid + 1} 0 R >> >> /Contents ${pid + 2} 0 R >>`),
    );
    obj(pid + 1, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      push('\nendstream');
    });
    obj(pid + 2, () => push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}\nendstream`));
  });
  const count = 3 + pages.length * 3;
  const xref = pos;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(pos);
  let o = 0;
  for (const b of parts) {
    out.set(b, o);
    o += b.length;
  }
  return out;
}
