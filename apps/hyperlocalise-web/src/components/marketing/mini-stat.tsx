export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/30 px-4 py-3">
      <div className="text-[0.68rem] uppercase tracking-[0.16em] text-white/30">{label}</div>
      <div className="mt-2 text-lg font-medium text-white">{value}</div>
    </div>
  );
}
