type Props = {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  /** Подписи для каждого значения; число кнопок = labels.length */
  labels: string[];
  /** С какого числа начинается шкала (1 для 1–5, 0 для месячных 0–3) */
  start?: number;
};

// Шкала крупных кнопок. Повторное касание выбранного значения снимает выбор.
export function Scale({ label, value, onChange, labels, start = 1 }: Props) {
  return (
    <fieldset class="scale">
      <legend>
        {label}
        {value !== undefined && <span class="muted"> — {labels[value - start]}</span>}
      </legend>
      <div class="scale-row">
        {labels.map((l, i) => {
          const v = i + start;
          const active = value === v;
          return (
            <button
              type="button"
              key={v}
              class={`scale-btn${active ? ' active' : ''}`}
              aria-pressed={active}
              aria-label={`${v}: ${l}`}
              onClick={() => onChange(active ? undefined : v)}
            >
              {v}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
