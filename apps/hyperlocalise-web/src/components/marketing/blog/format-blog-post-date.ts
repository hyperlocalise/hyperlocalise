import { format } from "date-fns";

export function formatBlogPostDate(date: string) {
  return format(new Date(date), "MMMM d, yyyy");
}
