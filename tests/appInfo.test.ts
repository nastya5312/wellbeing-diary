import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { APP_NAME, APP_SHORT_NAME } from '../src/lib/appInfo';

describe('сведения о приложении', () => {
  it('названия совпадают с ТЗ', () => {
    expect(APP_NAME).toBe('Дневник самочувствия');
    expect(APP_SHORT_NAME).toBe('Дневник');
  });

  it('версия в package.json задана в формате x.y.z', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('index.html содержит обязательные теги iOS', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf-8');
    for (const tag of [
      'apple-mobile-web-app-capable',
      'apple-mobile-web-app-status-bar-style',
      'apple-mobile-web-app-title',
      'viewport-fit=cover',
      'apple-touch-icon',
    ]) {
      expect(html).toContain(tag);
    }
    // Никаких внешних ресурсов (CDN, шрифты, аналитика)
    expect(html).not.toMatch(/https?:\/\//);
  });
});
