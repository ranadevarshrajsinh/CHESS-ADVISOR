import type { EngineWorker } from "@/types/engine-types";

export const getEngineWorker = (enginePath: string): EngineWorker => {
  const worker = new window.Worker(enginePath);

  const engineWorker: EngineWorker = {
    isReady: false,
    uci: (command: string) => worker.postMessage(command),
    listen: () => null,
    terminate: () => worker.terminate(),
  };

  worker.onmessage = (event) => {
    engineWorker.listen(event.data);
  };

  return engineWorker;
};

const THROTTLE_MS = 60;

export const sendCommandsToWorker = (
  worker: EngineWorker,
  commands: string[],
  finalMessage: string,
  onNewMessage?: (messages: string[]) => void
): Promise<string[]> => {
  return new Promise((resolve) => {
    const messages: string[] = [];
    let lastNotify = 0;

    worker.listen = (data) => {
      messages.push(data);

      if (onNewMessage) {
        const now = Date.now();
        if (now - lastNotify >= THROTTLE_MS) {
          lastNotify = now;
          onNewMessage(messages);
        }
      }

      if (data.startsWith(finalMessage)) {
        worker.listen = () => null;
        onNewMessage?.(messages);
        resolve(messages);
      }
    };

    for (const command of commands) {
      worker.uci(command);
    }
  });
};
