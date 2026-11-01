import { useEffect, useState } from 'preact/hooks';
import type { Flow, Scale5 } from '../models/types';
import { getDb } from '../db/schema';
import { getDay, saveDay } from '../db/repo';
import { Sheet } from '../components/Sheet';
import { Scale } from '../components/Scale';
import { safe, notify } from '../lib/notify';
import { ENERGY_LABELS, FLOW_LABELS, MOOD_LABELS, STRESS_LABELS } from '../lib/labels';
import { formatDateLong } from '../lib/dates';

// Вечерний чек-ин: настроение, энергия, стресс, месячные, заметка, «День заполнен».
export function EveningCheckin({ date, onClose }: { date: string; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [mood, setMood] = useState<number | undefined>();
  const [energy, setEnergy] = useState<number | undefined>();
  const [stress, setStress] = useState<number | undefined>();
  const [flow, setFlow] = useState<number | undefined>();
  const [note, setNote] = useState('');
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    void safe(() => getDay(getDb(), date)).then((day) => {
      setMood(day?.wellbeing?.mood);
      setEnergy(day?.wellbeing?.energy);
      setStress(day?.wellbeing?.stress);
      setFlow(day?.flow);
      setNote(day?.note ?? '');
      setCompleted(day?.completed ?? false);
      setLoaded(true);
    });
  }, [date]);

  const save = async () => {
    const ok = await safe(async () => {
      await saveDay(getDb(), date, {
        wellbeing: { mood: mood as Scale5 | undefined, energy: energy as Scale5 | undefined, stress: stress as Scale5 | undefined },
        flow: flow as Flow | undefined,
        note: note.trim() || undefined,
        completed,
      });
      return true;
    });
    if (ok) {
      notify(completed ? 'Сохранено, день заполнен' : 'Сохранено');
      onClose();
    }
  };

  return (
    <Sheet
      title={`Самочувствие · ${formatDateLong(date)}`}
      onClose={onClose}
      footer={
        <button type="button" class="btn btn-primary btn-block" disabled={!loaded} onClick={save}>
          Сохранить
        </button>
      }
    >
      <div class="form">
        <Scale label="Настроение" value={mood} onChange={setMood} labels={MOOD_LABELS} />
        <Scale label="Энергия" value={energy} onChange={setEnergy} labels={ENERGY_LABELS} />
        <Scale label="Стресс" value={stress} onChange={setStress} labels={STRESS_LABELS} />
        <Scale label="Месячные" value={flow} onChange={setFlow} labels={FLOW_LABELS} start={0} />
        <label class="field">
          <span>Заметка о дне</span>
          <textarea rows={3} value={note} maxLength={2000} onInput={(e) => setNote(e.currentTarget.value)} />
        </label>
        <label class="check check-big">
          <input type="checkbox" checked={completed} onChange={(e) => setCompleted(e.currentTarget.checked)} />
          <span>
            День заполнен
            <span class="muted small block">Отметь, когда внесла всё важное за день. В анализ идут только заполненные дни.</span>
          </span>
        </label>
      </div>
    </Sheet>
  );
}
