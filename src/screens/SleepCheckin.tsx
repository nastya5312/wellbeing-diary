import { useEffect, useState } from 'preact/hooks';
import type { Scale5, Sleep } from '../models/types';
import { getDb } from '../db/schema';
import { getDay, saveDay } from '../db/repo';
import { Sheet } from '../components/Sheet';
import { Scale } from '../components/Scale';
import { safe, notify } from '../lib/notify';
import { QUALITY_LABELS } from '../lib/labels';
import { formatDateLong, formatDuration, sleepDurationMin } from '../lib/dates';

// Чек-ин сна. Сон относится к дате пробуждения (date).
export function SleepCheckin({ date, onClose }: { date: string; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [bedtime, setBedtime] = useState('23:00');
  const [wake, setWake] = useState('07:00');
  const [quality, setQuality] = useState<number | undefined>();
  const [awakenings, setAwakenings] = useState(0);
  const [note, setNote] = useState('');
  // Ручная поправка длительности (например, долго не могла уснуть). null — считать автоматически.
  const [manualMin, setManualMin] = useState<number | null>(null);

  useEffect(() => {
    void safe(() => getDay(getDb(), date)).then((day) => {
      const s = day?.sleep;
      if (s) {
        if (s.bedtime) setBedtime(s.bedtime);
        if (s.wake) setWake(s.wake);
        setQuality(s.quality);
        setAwakenings(s.awakenings ?? 0);
        setNote(s.note ?? '');
        if (s.bedtime && s.wake && s.durationMin !== undefined && s.durationMin !== sleepDurationMin(s.bedtime, s.wake)) {
          setManualMin(s.durationMin);
        }
      }
      setLoaded(true);
    });
  }, [date]);

  const autoMin = sleepDurationMin(bedtime, wake);
  const duration = manualMin ?? autoMin;

  const save = async () => {
    const sleep: Sleep = {
      bedtime,
      wake,
      durationMin: duration,
      quality: quality as Scale5 | undefined,
      awakenings,
      note: note.trim() || undefined,
    };
    const ok = await safe(async () => (await saveDay(getDb(), date, { sleep }), true));
    if (ok) {
      notify('Сон сохранён');
      onClose();
    }
  };

  return (
    <Sheet
      title={`Сон · ${formatDateLong(date)}`}
      onClose={onClose}
      footer={
        <button type="button" class="btn btn-primary btn-block" disabled={!loaded} onClick={save}>
          Сохранить
        </button>
      }
    >
      <div class="form">
        <div class="row">
          <label class="field grow">
            <span>Легла</span>
            <input type="time" value={bedtime} onInput={(e) => e.currentTarget.value && setBedtime(e.currentTarget.value)} />
          </label>
          <label class="field grow">
            <span>Встала</span>
            <input type="time" value={wake} onInput={(e) => e.currentTarget.value && setWake(e.currentTarget.value)} />
          </label>
        </div>

        <div class="field">
          <span>Длительность</span>
          <div class="row center">
            <strong class="big-num">{formatDuration(duration)}</strong>
            {manualMin === null ? (
              <button type="button" class="btn btn-link" onClick={() => setManualMin(autoMin)}>
                Поправить
              </button>
            ) : (
              <button type="button" class="btn btn-link" onClick={() => setManualMin(null)}>
                Считать автоматически
              </button>
            )}
          </div>
          {manualMin !== null && (
            <div class="row">
              <label class="field grow">
                <span>Часы</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={23}
                  value={Math.floor(manualMin / 60)}
                  onInput={(e) => setManualMin(clamp(Number(e.currentTarget.value), 0, 23) * 60 + (manualMin % 60))}
                />
              </label>
              <label class="field grow">
                <span>Минуты</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={59}
                  step={5}
                  value={manualMin % 60}
                  onInput={(e) => setManualMin(Math.floor(manualMin / 60) * 60 + clamp(Number(e.currentTarget.value), 0, 59))}
                />
              </label>
            </div>
          )}
        </div>

        <Scale label="Качество сна" value={quality} onChange={setQuality} labels={QUALITY_LABELS} />

        <div class="field">
          <span>Пробуждения ночью</span>
          <div class="stepper">
            <button type="button" class="btn" aria-label="Меньше" disabled={awakenings <= 0} onClick={() => setAwakenings(awakenings - 1)}>
              −
            </button>
            <strong aria-live="polite">{awakenings}</strong>
            <button type="button" class="btn" aria-label="Больше" disabled={awakenings >= 20} onClick={() => setAwakenings(awakenings + 1)}>
              +
            </button>
          </div>
        </div>

        <label class="field">
          <span>Заметка</span>
          <textarea rows={2} value={note} maxLength={500} onInput={(e) => setNote(e.currentTarget.value)} />
        </label>
      </div>
    </Sheet>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : min;
}
