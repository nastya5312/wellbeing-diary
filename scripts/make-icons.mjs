// Генерация PNG-иконок из scripts/icon.svg. Запускать вручную при смене иконки:
//   node scripts/make-icons.mjs
// Нужен Playwright с Chromium (в проект не добавлен как зависимость: иконки уже лежат в public/).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync(new URL('./icon.svg', import.meta.url), 'utf-8');
const out = (name) => new URL(`../public/${name}`, import.meta.url);

// favicon: та же картинка, но со скруглением
writeFileSync(out('favicon.svg'), svg.replace('<rect width="512" height="512"', '<rect width="512" height="512" rx="112"'));

const targets = [
  { name: 'apple-touch-icon.png', size: 180, scale: 1 },
  { name: 'icon-192.png', size: 192, scale: 1 },
  { name: 'icon-512.png', size: 512, scale: 1 },
  // maskable: содержимое уменьшено до безопасной зоны (~80%), фон на весь квадрат
  { name: 'icon-maskable-512.png', size: 512, scale: 0.8 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  const inner = t.size * t.scale;
  const off = (t.size - inner) / 2;
  await page.setContent(`<html><body style="margin:0;background:#2f6f62">
    <div style="position:absolute;left:${off}px;top:${off}px;width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
  </body></html>`);
  writeFileSync(out(t.name), await page.screenshot({ type: 'png' }));
  console.log('готово:', t.name);
}
await browser.close();
