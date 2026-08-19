export class InMemoryCollaborationMetrics {
  #activeSseConnections = 0;
  #sseConnections = 0;
  #sseReconnects = 0;

  connected(reconnect: boolean) {
    this.#activeSseConnections += 1;
    this.#sseConnections += 1;
    if (reconnect) this.#sseReconnects += 1;
  }

  disconnected() {
    this.#activeSseConnections = Math.max(0, this.#activeSseConnections - 1);
  }

  snapshot() {
    return {
      activeSseConnections: this.#activeSseConnections,
      sseConnections: this.#sseConnections,
      sseReconnects: this.#sseReconnects,
    };
  }
}
