export type LifecycleDependencies = {
  closeServer: () => Promise<void>;
  closeDatabase: () => Promise<void>;
};

export function createShutdown(dependencies: LifecycleDependencies) {
  let shutdownPromise: Promise<void> | undefined;
  return function shutdown(): Promise<void> {
    shutdownPromise ??= (async () => {
      await dependencies.closeServer();
      await dependencies.closeDatabase();
    })();
    return shutdownPromise;
  };
}
