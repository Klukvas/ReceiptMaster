import { KeyedMutex } from "./keyed-mutex.util";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("KeyedMutex", () => {
  it("serializes tasks of one key and runs different keys side by side", async () => {
    const mutex = new KeyedMutex();
    const log: string[] = [];
    const task = (name: string) => async () => {
      log.push(`start ${name}`);
      await tick();
      log.push(`end ${name}`);
    };

    await Promise.all([
      mutex.runExclusive("a", task("a1")),
      mutex.runExclusive("a", task("a2")),
      mutex.runExclusive("b", task("b1")),
    ]);

    expect(log.indexOf("end a1")).toBeLessThan(log.indexOf("start a2"));
    expect(log.indexOf("start b1")).toBeLessThan(log.indexOf("end a1"));
  });

  it("lets the next task run after a failure and propagates the error", async () => {
    const mutex = new KeyedMutex();
    const failing = mutex.runExclusive("k", async () => {
      throw new Error("boom");
    });
    const next = mutex.runExclusive("k", async () => "ok");

    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
  });
});
