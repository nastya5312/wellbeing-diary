import { Icon } from '../components/Icon';
import { useState } from 'preact/hooks';
import type { Scale5, Settings, Theme } from '../models/types';
import { getDb, isDemo, setDemoFlag } from '../db/schema';
import { getSettings, updateSettings } from '../db/repo';
import { DEFAULT_SETTINGS } from '../db/defaults';
import { Sheet } from '../components/Sheet';
import { useLive } from '../lib/useLive';
import { notify, safe } from '../lib/notify';
import { INTENSITY_LABELS } from '../lib/labels';
import { APP_NAME, APP_VERSION } from '../lib/appInfo';

const THEMES: { id: Theme; label: string }[] = [
  { id: 'auto', label: 'Как в iPhone' },
  { id: 'light', label: 'Светлая' },
  { id: 'dark', label: 'Тёмная' },
];
const LAGS = [0, 1, 2, 3];
const LAG_LABEL = ['в тот же день', 'на следующий', 'через 2 дня', 'через 3 дня'];
const hours = (min: number) => String(min / 60).replace('.', ',');

// Настройки (ТЗ, 6.11) без PIN-кода (по решению Насти).
export function SettingsScreen({ onBack, onOpenBackup }: { onBack: () => void; onOpenBackup: () => void }) {
  const db = getDb();
  const s = useLive(() => getSettings(db), []);
  const [deleting, setDeleting] = useState(false);
  const [checking, setChecking] = useState(false);

  if (!s) return null;
  const save = (patch: Partial<Settings>, msg = 'Сохранено') => void safe(() => updateSettings(db, patch)).then((r) => r && notify(msg));

  const setSleep = (key: 'shortSleepMin' | 'longSleepMin', text: string) => {
    const h = Number(text.replace(',', '.'));
    if (!Number.isFinite(h) || h < 2 || h > 14) {
      notify('Введи часы от 2 до 14, например 6 или 6,5', 'error');
      return;
    }
    const min = Math.round(h * 60);
    const next = { shortSleepMin: s.shortSleepMin, longSleepMin: s.longSleepMin, [key]: min };
    if (next.shortSleepMin >= next.longSleepMin) {
      notify('Короткий сон должен быть меньше долгого', 'error');
      return;
    }
    save({ [key]: min });
  };

  const toggleLag = (lag: number) => {
    const next = s.lagDays.includes(lag) ? s.lagDays.filter((l) => l !== lag) : [...s.lagDays, lag].sort();
    if (!next.length) {
      notify('Нужен хотя бы один сдвиг', 'error');
      return;
    }
    save({ lagDays: next });
  };

  const checkUpdate = async () => {
    setChecking(true);
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (!reg) {
        notify('Проверка недоступна в этом режиме');
        return;
      }
      await reg.update();
      // Если версия новее — внизу появится плашка «Доступна новая версия»
      setTimeout(() => {
        if (!reg.installing && !reg.waiting) notify('Установлена последняя версия');
      }, 1500);
    } catch {
      notify('Не удалось проверить: нет интернета?', 'error');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div class="screen">
      <header class="screen-head row center">
        <button type="button" class="icon-btn round" onClick={onBack} aria-label="Назад">
          <Icon name="back" size={20} />
        </button>
        <h1>Настройки</h1>
      </header>

      <section class="panel stack">
        <h2>Тема</h2>
        <div class="chips" role="radiogroup" aria-label="Тема">
          {THEMES.map((t) => (
            <button type="button" key={t.id} role="radio" aria-checked={s.theme === t.id} class={`chip${s.theme === t.id ? ' active' : ''}`} onClick={() => save({ theme: t.id })}>
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section class="panel stack">
        <h2>Граница дня</h2>
        <label class="field">
          <span>Новый день начинается в</span>
          <input type="time" value={s.dayStartsAt} onChange={(e) => e.currentTarget.value && save({ dayStartsAt: e.currentTarget.value })} />
        </label>
        <p class="muted small">
          Всё, что отмечено до этого времени ночью, относится к предыдущему дню. Меняет только новые записи — старые остаются в своих днях.
        </p>
      </section>

      <section class="panel stack">
        <h2>Анализ</h2>
        <div class="field">
          <span>Учитывать симптом, если сила не меньше</span>
          <div class="chips" role="radiogroup">
            {INTENSITY_LABELS.map((label, i) => (
              <button
                type="button"
                key={i}
                role="radio"
                aria-checked={s.symptomMinIntensity === i + 1}
                class={`chip${s.symptomMinIntensity === i + 1 ? ' active' : ''}`}
                onClick={() => save({ symptomMinIntensity: (i + 1) as Scale5 })}
              >
                {i + 1} · {label}
              </button>
            ))}
          </div>
        </div>
        <div class="row">
          <label class="field grow">
            <span>Короткий сон: меньше, ч</span>
            <input type="text" inputMode="decimal" key={`s${s.shortSleepMin}`} defaultValue={hours(s.shortSleepMin)} onChange={(e) => setSleep('shortSleepMin', e.currentTarget.value)} />
          </label>
          <label class="field grow">
            <span>Долгий сон: больше, ч</span>
            <input type="text" inputMode="decimal" key={`l${s.longSleepMin}`} defaultValue={hours(s.longSleepMin)} onChange={(e) => setSleep('longSleepMin', e.currentTarget.value)} />
          </label>
        </div>
        <div class="field">
          <span>Искать совпадения</span>
          {LAGS.map((lag) => (
            <label class="check" key={lag}>
              <input type="checkbox" checked={s.lagDays.includes(lag)} onChange={() => toggleLag(lag)} />
              <span>{LAG_LABEL[lag]}</span>
            </label>
          ))}
        </div>
        <p class="muted small">Чем больше вариантов проверяется, тем строже поправка на случайность — и тем меньше выводов проходит.</p>
        <button
          type="button"
          class="btn btn-link"
          onClick={() =>
            save(
              {
                symptomMinIntensity: DEFAULT_SETTINGS.symptomMinIntensity,
                shortSleepMin: DEFAULT_SETTINGS.shortSleepMin,
                longSleepMin: DEFAULT_SETTINGS.longSleepMin,
                lagDays: DEFAULT_SETTINGS.lagDays,
              },
              'Настройки анализа сброшены',
            )
          }
        >
          Вернуть настройки анализа по умолчанию
        </button>
      </section>

      <section class="panel stack">
        <h2>Приложение</h2>
        <p>
          {APP_NAME} · версия {APP_VERSION}
        </p>
        <button type="button" class="btn btn-block" disabled={checking} onClick={() => void checkUpdate()}>
          {checking ? 'Проверяю…' : 'Проверить обновление'}
        </button>
      </section>

      <section class="panel stack">
        <h2>Удаление</h2>
        <button type="button" class="btn btn-danger btn-block" onClick={() => setDeleting(true)}>
          {isDemo() ? 'Удалить демо-данные' : 'Удалить все данные'}
        </button>
      </section>

      {deleting && <DeleteAll onClose={() => setDeleting(false)} onOpenBackup={onOpenBackup} />}
    </div>
  );
}

const CONFIRM_WORD = 'удалить';

function DeleteAll({ onClose, onOpenBackup }: { onClose: () => void; onOpenBackup: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [text, setText] = useState('');
  const demo = isDemo();

  const run = async () => {
    const db = getDb();
    db.close();
    await safe(async () => {
      await db.delete();
      if (demo) setDemoFlag(false);
      location.reload();
    });
  };

  return (
    <Sheet title="Удалить все данные" onClose={onClose}>
      {step === 1 ? (
        <div class="stack">
          <p>
            Будут удалены <b>все</b> записи, справочник, курсы, показатели и настройки на этом телефоне. Восстановить их можно только
            из резервной копии.
          </p>
          {!demo && (
            <button type="button" class="btn btn-block" onClick={onOpenBackup}>
              Сначала сохранить копию
            </button>
          )}
          <button type="button" class="btn btn-danger btn-block" onClick={() => setStep(2)}>
            Продолжить удаление
          </button>
          <button type="button" class="btn btn-block" onClick={onClose}>
            Отмена
          </button>
        </div>
      ) : (
        <div class="stack">
          <label class="field">
            <span>Для подтверждения напиши слово «{CONFIRM_WORD}»</span>
            <input type="text" value={text} autoComplete="off" onInput={(e) => setText(e.currentTarget.value)} />
          </label>
          <button
            type="button"
            class="btn btn-danger btn-block"
            disabled={text.trim().toLowerCase() !== CONFIRM_WORD}
            onClick={() => void run()}
          >
            Удалить навсегда
          </button>
          <button type="button" class="btn btn-block" onClick={onClose}>
            Отмена
          </button>
        </div>
      )}
    </Sheet>
  );
}
