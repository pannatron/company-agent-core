/**
 * Per-path async mutex.
 *
 * Multiple chat turns can run in parallel and they may all touch the same
 * data files (data/social-posts.json, data/finance.csv, etc.). Without a
 * lock the last-write-wins semantics of `fs.writeFile` can silently lose
 * an agent's changes — we hit this with social-posts.json under BUG-001.
 *
 * Usage:
 *   await withFileLock(absPath, async () => {
 *     const raw = await fs.readFile(absPath, "utf8");
 *     const next = mutate(JSON.parse(raw));
 *     await fs.writeFile(absPath, JSON.stringify(next), "utf8");
 *   });
 *
 * Scope: in-process only. Fine for single Next.js dev/prod instance; not
 * a substitute for OS-level locking if we ever multi-instance the server.
 */

const locks = new Map<string, Promise<unknown>>();

export async function withFileLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  // chain regardless of prev outcome so a failed holder doesn't poison the queue
  const next = prev.then(fn, fn);
  locks.set(
    key,
    next.finally(() => {
      if (locks.get(key) === next) locks.delete(key);
    }),
  );
  return next as Promise<T>;
}
