export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
      <div className="text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-lg font-medium text-foreground">{value}</div>
    </div>
  );
}
