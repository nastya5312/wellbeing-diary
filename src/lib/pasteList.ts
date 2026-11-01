// Разбор списка, вставленного текстом. Формат строки: «Тип: название | тег, тег».
// Строки без известного типа (заголовки, пояснения, даты) пропускаются.
import type { ItemKind } from '../models/types';
import { normalizeName } from './similar';

export type ListEntry = { kind: ItemKind; name: string; tags: string[] };
export type ParsedList = { entries: ListEntry[]; skipped: number };

const PREFIXES: [RegExp, ItemKind][] = [
  [/^лекарств[оа]$/, 'med'],
  [/^препарат(ы)?$/, 'med'],
  [/^добавк[аи]$/, 'supplement'],
  [/^бад(ы)?$/, 'supplement'],
  [/^симптом(ы)?$/, 'symptom'],
  [/^еда$/, 'food'],
  [/^продукт(ы)?$/, 'food'],
  [/^напит(ок|ки)$/, 'drink'],
  [/^активност[ьи]$/, 'activity'],
  [/^другое$/, 'other'],
];

function kindOf(prefix: string): ItemKind | null {
  const p = normalizeName(prefix);
  for (const [re, kind] of PREFIXES) if (re.test(p)) return kind;
  return null;
}

export function parseList(text: string): ParsedList {
  const entries: ListEntry[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    // Маркеры списков в начале строки: «- », «• », «* », «1. »
    const line = rawLine.trim().replace(/^([-•*·]|\d+[.)])\s+/, '');
    if (!line) continue;
    const colon = line.indexOf(':');
    const kind = colon > 0 ? kindOf(line.slice(0, colon)) : null;
    if (!kind) {
      skipped++;
      continue;
    }
    const rest = line.slice(colon + 1);
    const bar = rest.indexOf('|');
    const name = (bar >= 0 ? rest.slice(0, bar) : rest).trim().replace(/\s+/g, ' ');
    if (!name) {
      skipped++;
      continue;
    }
    const tags = bar >= 0 ? [...new Set(rest.slice(bar + 1).split(',').map(normalizeName).filter(Boolean))] : [];
    const key = `${kind}:${normalizeName(name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ kind, name, tags });
  }
  return { entries, skipped };
}
