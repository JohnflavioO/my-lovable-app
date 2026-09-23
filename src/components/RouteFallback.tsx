// Fallback leve exibido durante lazy-load de rotas.
// Evita o splash preto de tela cheia entre navegações SPA.
export default function RouteFallback() {
  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 h-0.5 bg-emerald-500/80 animate-pulse z-[9999]"
    />
  );
}
