/**
 * Check if gateway is running by attempting to connect
 * Uses browser's native WebSocket API
 */
export async function isGatewayRunning(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const url = `ws://${host}:${port}`;
    const ws = new WebSocket(url);

    const timeout = setTimeout(() => {
      ws.close();
      resolve(false);
    }, 1000);

    ws.addEventListener("open", () => {
      clearTimeout(timeout);
      ws.close();
      resolve(true);
    });

    ws.addEventListener("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}
