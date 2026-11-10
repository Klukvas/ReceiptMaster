/**
 * Runs tasks with the same key one after another inside this process. Holds no database
 * connection while waiting, so it cannot starve the pool the way a lock-holding
 * transaction around a long operation would.
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  async runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    // The next waiter must start after this one settles, whether it succeeded or not.
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    try {
      return await run;
    } finally {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}
