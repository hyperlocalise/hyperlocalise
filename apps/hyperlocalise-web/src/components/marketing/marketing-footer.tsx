type MarketingFooterColumn = {
  title: string;
  links: string[];
};

type MarketingFooterProps = {
  columns: MarketingFooterColumn[];
};

export function MarketingFooter({ columns }: MarketingFooterProps) {
  return (
    <footer className="grid gap-12 lg:grid-cols-[160px_1fr]">
      <div className="flex items-center gap-2 text-sm text-white/70">
        <div className="size-5 rounded-full border border-white/20 bg-white/10" />
      </div>

      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        {columns.map((column) => (
          <div key={column.title}>
            <div className="text-sm font-medium text-white">{column.title}</div>
            <div className="mt-4 space-y-3 text-sm text-white/45">
              {column.links.map((link) => (
                <div key={link}>{link}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </footer>
  );
}
