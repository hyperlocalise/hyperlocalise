type BlogDateIntl = {
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
};

export function formatBlogPostDate(intl: BlogDateIntl, date: string) {
  const parsed = Date.parse(date);
  if (Number.isNaN(parsed)) {
    return date;
  }

  return intl.formatDate(parsed, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
