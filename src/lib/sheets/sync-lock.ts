/** Serialize sheet sync/sort writes so parallel API requests do not race. */
let syncChain: Promise<void> = Promise.resolve();

export function withSheetWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = syncChain.then(fn);
  syncChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
