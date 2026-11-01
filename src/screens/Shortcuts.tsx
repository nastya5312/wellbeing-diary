import { useState } from 'preact/hooks';
import { getDb } from '../db/schema';
import { enableDailyMetric, setDailyValue } from '../db/courses';
import { Sheet } from '../components/Sheet';
import { notify, safe } from '../lib/notify';
import { parseStepsText, type StepsParse } from '../lib/stepsImport';
import { formatDateRu } from '../lib/dates';

// Напоминания и шаги из «Здоровья» через приложение «Команды» (ТЗ, этап 9).
// Всё, что про настройки iPhone, не проверено на устройстве: названия пунктов могут отличаться в твоей версии iOS.
export function Shortcuts({ onBack }: { onBack: () => void }) {
  const [parsed, setParsed] = useState<StepsParse | null>(null);
  const [manual, setManual] = useState('');
  const [showManual, setShowManual] = useState(false);

  const fromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      show(text);
    } catch {
      setShowManual(true);
      notify('Не удалось прочитать буфер. Вставь текст вручную в поле ниже.', 'error');
    }
  };
  const show = (text: string) => {
    const r = parseStepsText(text);
    if (!r.days.length && r.undated === null) {
      notify('Не нашла шаги в тексте. Нужны строки вида «2026-10-31 8431».', 'error');
      return;
    }
    setParsed(r);
  };

  const save = async (r: StepsParse) => {
    const ok = await safe(async () => {
      const db = getDb();
      const m = await enableDailyMetric(db, 'Шаги', 'шагов');
      for (const d of r.days) await setDailyValue(db, m.id, d.date, d.steps);
      return true;
    });
    if (ok) {
      notify(`Шаги сохранены: ${r.days.length} дн.`);
      setParsed(null);
      setManual('');
    }
  };

  return (
    <div class="screen">
      <header class="screen-head row center">
        <button type="button" class="icon-btn" onClick={onBack} aria-label="Назад">
          ‹
        </button>
        <h1>Напоминания и шаги</h1>
      </header>
      <p class="muted small">
        Приложение работает без сервера и само ничего не присылает. Напоминания и шаги из «Здоровья» делает приложение
        «Команды» на iPhone — это его возможности, не наши. Названия пунктов зависят от версии iOS и не проверены на твоём телефоне.
      </p>

      <section class="panel stack">
        <h2>1. Напоминания утром и вечером</h2>
        <ol class="steps">
          <li>Открой приложение <b>«Команды»</b> (иконка с двумя квадратами).</li>
          <li>Внизу нажми <b>«Автоматизация»</b>, затем <b>«+»</b> (или «Новая автоматизация»).</li>
          <li>Выбери <b>«Время суток»</b>. Поставь время (например, 09:00), повтор <b>«Ежедневно»</b>, нажми «Далее».</li>
          <li>Нажми <b>«Добавить действие»</b>, найди <b>«Показать уведомление»</b> и напиши текст: «Дневник: сон и самочувствие».</li>
          <li>Нажми «Далее». Выключи <b>«Спрашивать до запуска»</b> и нажми «Готово».</li>
          <li>Так же сделай второе напоминание на вечер (например, 21:30): «Дневник: отметить день».</li>
        </ol>
        <p class="muted small">
          Если iPhone просит подтверждать запуск, напоминание всё равно придёт, но с кнопкой. Чтобы оно открывало дневник, вместо
          «Показать уведомление» выбери действие <b>«Открыть приложение»</b> → «Дневник» (если оно есть в списке).
        </p>
      </section>

      <section class="panel stack">
        <h2>2. Шаги из «Здоровья»</h2>
        <p class="small">
          «Здоровье» не отдаёт данные сайтам напрямую, поэтому шаги переносятся через буфер обмена. Один раз собери команду:
        </p>
        <ol class="steps">
          <li>В «Командах» открой вкладку <b>«Мои команды»</b> → <b>«+»</b>. Назови команду «Шаги в дневник».</li>
          <li>Действие <b>«Найти образцы Здоровья»</b>: тип <b>«Шаги»</b>, фильтр «Дата начала» — <b>«в последних 7 дней»</b>, сортировка по дате.</li>
          <li>Действие <b>«Сгруппировать образцы Здоровья по»</b> → <b>«День»</b>.</li>
          <li>Действие <b>«Повторить для каждого элемента»</b>. Внутри: <b>«Текст»</b>: дата начала в формате <code>гггг-мм-дд</code>, пробел, значение (сумма шагов за день).</li>
          <li>После повтора: <b>«Скопировать в буфер обмена»</b> (результат повтора).</li>
          <li>Первый запуск iPhone спросит доступ к шагам из «Здоровья» — разреши.</li>
        </ol>
        <p class="small">Как пользоваться: запусти команду «Шаги в дневник», потом вернись сюда и нажми кнопку:</p>
        <button type="button" class="btn btn-primary btn-block" onClick={() => void fromClipboard()}>
          Вставить шаги из буфера
        </button>
        <button type="button" class="btn btn-link" onClick={() => setShowManual(!showManual)}>
          {showManual ? 'Скрыть ручной ввод' : 'Не читается буфер? Вставить текст вручную'}
        </button>
        {showManual && (
          <>
            <textarea rows={5} value={manual} placeholder={'2026-10-30 8431\n2026-10-31 10250'} onInput={(e) => setManual(e.currentTarget.value)} />
            <button type="button" class="btn btn-block" disabled={!manual.trim()} onClick={() => show(manual)}>
              Показать, что будет сохранено
            </button>
          </>
        )}
        <p class="muted small">
          Принимаются даты вида 2026-10-31, 31.10.2026 и «31 окт. 2026 г.». Шаги попадут в ежедневное измерение «Шаги»
          (появится на экране «Сегодня» и в графиках), а значит и в анализ. Если за дату уже есть значение, оно заменится.
          Автоматически по расписанию это не работает — только по твоему запуску команды.
        </p>
      </section>

      {parsed && (
        <Sheet
          title="Сохранить шаги?"
          onClose={() => setParsed(null)}
          footer={
            parsed.days.length > 0 ? (
              <button type="button" class="btn btn-primary btn-block" onClick={() => void save(parsed)}>
                Сохранить ({parsed.days.length} дн.)
              </button>
            ) : undefined
          }
        >
          {parsed.days.length > 0 ? (
            <ul class="list small">
              {parsed.days.map((d) => (
                <li key={d.date} class="row">
                  <span class="grow">{formatDateRu(d.date)}</span>
                  <b>{d.steps.toLocaleString('ru-RU')}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              Нашлось число {parsed.undated?.toLocaleString('ru-RU')}, но без даты. Добавь дату в начале строки, например «2026-10-31{' '}
              {parsed.undated}».
            </p>
          )}
          {parsed.skipped.length > 0 && <p class="muted small">Пропущено строк: {parsed.skipped.length}.</p>}
        </Sheet>
      )}
    </div>
  );
}
