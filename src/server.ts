import { buildApp } from "./app";
import { loadEnv } from "./config/env";

const env = loadEnv();
const app = await buildApp(env);

async function shutdown(signal: NodeJS.Signals) {
  app.log.info({ signal }, "shutting down");
  await app.close();
  process.exit(0);
}

process.once("SIGINT", (signal) => {
  void shutdown(signal);
});
process.once("SIGTERM", (signal) => {
  void shutdown(signal);
});

try {
  await app.listen({
    host: env.HOST,
    port: env.PORT
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
