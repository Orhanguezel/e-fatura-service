import { connect } from "node:net";

export async function checkRedisHealth(redisUrl?: string): Promise<"up" | "down" | "not_configured"> {
  if (!redisUrl) {
    return "not_configured";
  }

  const url = new URL(redisUrl);
  const port = Number(url.port || "6379");

  return await new Promise((resolve) => {
    const socket = connect({ host: url.hostname, port });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve("down");
    }, 500);

    socket.once("connect", () => {
      clearTimeout(timeout);
      socket.end();
      resolve("up");
    });
    socket.once("error", () => {
      clearTimeout(timeout);
      resolve("down");
    });
  });
}
