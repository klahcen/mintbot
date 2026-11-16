import { EventEmitter } from "node:events";
import type { MonitorScheduler } from "../../src/chain.js";
export class FakeSocket extends EventEmitter {
  sent: string[] = [];
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.emit("close");
  }
}
export class ManualScheduler implements MonitorScheduler {
  time = 0;
  private sequence = 0;
  private tasks = new Map<number, { at: number; callback: () => void }>();
  now = () => this.time;
  schedule = (callback: () => void, delayMs: number) => {
    const id = ++this.sequence;
    this.tasks.set(id, { at: this.time + delayMs, callback });
    return id;
  };
  cancel = (handle: unknown) => {
    this.tasks.delete(handle as number);
  };
  advance(ms: number) {
    const target = this.time + ms;
    for (let n = 0; n < 10000; n++) {
      const next = [...this.tasks].sort(
        (a, b) => a[1].at - b[1].at || a[0] - b[0],
      )[0];
      if (!next || next[1].at > target) {
        this.time = target;
        return;
      }
      this.tasks.delete(next[0]);
      this.time = next[1].at;
      next[1].callback();
    }
    throw Error("Scheduler did not settle");
  }
  get pending() {
    return this.tasks.size;
  }
}
export function notification(
  signature: string,
  logs: string[] = [],
  slot = 1,
  subscription = 44,
) {
  return JSON.stringify({
    jsonrpc: "2.0",
    method: "logsNotification",
    params: {
      subscription,
      result: { context: { slot }, value: { signature, err: null, logs } },
    },
  });
}
export function open(socket: FakeSocket, subscription = 44) {
  socket.emit("open");
  socket.emit("message", JSON.stringify({ id: 1, result: subscription }));
}
