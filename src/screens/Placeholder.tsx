export function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <div class="screen">
      <header class="screen-head">
        <h1>{title}</h1>
      </header>
      <p class="muted">{text}</p>
    </div>
  );
}
