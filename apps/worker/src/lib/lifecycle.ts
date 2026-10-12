type Close = () => Promise<unknown>
type Phase = "consumers" | "chat"
type Setup = (
  register: (close: Close, phase?: Phase) => void,
) => Promise<void> | void

export class WorkerLifecycle {
  private readonly startups: Promise<void>[] = []
  private readonly closers: { close: Close; phase: Phase }[] = []
  private stopping: Promise<PromiseSettledResult<unknown>[]> | undefined

  start(setup: Setup): Promise<void> {
    if (this.stopping) {
      throw new Error("Cannot start a worker during shutdown")
    }
    const startup = Promise.resolve().then(() =>
      setup((close, phase = "consumers") =>
        this.closers.push({ close, phase }),
      ),
    )
    this.startups.push(startup)
    return startup
  }

  stop(): Promise<PromiseSettledResult<unknown>[]> {
    this.stopping ??= this.drain()
    return this.stopping
  }

  private async drain(): Promise<PromiseSettledResult<unknown>[]> {
    const starts = await Promise.allSettled(this.startups)
    const results: PromiseSettledResult<unknown>[] = [...starts]
    // Integration jobs can enqueue and await chat jobs while draining.
    // Keep chat consuming until every upstream consumer has stopped.
    for (const phase of ["consumers", "chat"]) {
      const closes = await Promise.allSettled(
        this.closers
          .filter((entry) => entry.phase === phase)
          .map(({ close }) => Promise.resolve().then(close)),
      )
      results.push(...closes)
    }
    return results
  }
}

export async function closeWorkerResources(
  worker: { close: Close },
  closeResources: Close,
): Promise<void> {
  try {
    await worker.close()
  } finally {
    await closeResources()
  }
}
