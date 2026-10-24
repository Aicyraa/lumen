// An in-process FIFO mutex per key. Holds no database connection while waiting.
// shortcut: it only serialises inside one API process; with several API instances, add a DB-level guard.
export class KeyedLock {
  private tails = new Map<string, Promise<void>>();

  // Resolves when it is this caller's turn. The returned release is idempotent; a holder that never releases is let go after ttlMs.
  async acquire(key: string, ttlMs: number): Promise<() => void> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prev.then(() => mine);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    await prev;
    const timer = setTimeout(release, ttlMs);
    timer.unref();
    return () => {
      clearTimeout(timer);
      release();
    };
  }
}
