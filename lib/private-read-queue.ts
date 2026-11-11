/** Only active browser reads retain a credential. Nothing is persisted or retried. */
export function createPrivateReadQueue() {
  const tails = new Map<string, Promise<void>>();
  function wait(previous: Promise<void>, signal?: AbortSignal): Promise<void> {
    if (!signal) return previous;
    if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('Disconnected', 'AbortError'));
    return new Promise((resolve, reject) => {
      const aborted = () => { signal.removeEventListener('abort', aborted); reject(signal.reason ?? new DOMException('Disconnected', 'AbortError')); };
      signal.addEventListener('abort', aborted, {once: true});
      previous.then(() => { signal.removeEventListener('abort', aborted); resolve(); });
    });
  }
  return async function read<T>(credential: string, signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T> {
    const previous = tails.get(credential);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    // A cancelled queued read retains its predecessor until that predecessor settles.
    const tail = previous ? previous.then(() => gate) : gate;
    tails.set(credential, tail);
    void tail.then(() => { if (tails.get(credential) === tail) tails.delete(credential); });
    try {
      if (previous) await wait(previous, signal);
      signal?.throwIfAborted();
      return await operation();
    } finally { release(); }
  };
}

/** All private panels sharing a human access consume its quota in sequence. */
export const serializedPrivateRead = createPrivateReadQueue();
