export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) {
  if (items.length === 0) {
    return [] as R[];
  }

  const results: R[] = Array.from({ length: items.length });
  let nextIndex = 0;
  const abortController = new AbortController();

  async function worker() {
    while (!abortController.signal.aborted) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }

      try {
        results[currentIndex] = await mapper(items[currentIndex] as T);
      } catch (error) {
        abortController.abort();
        throw error;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
