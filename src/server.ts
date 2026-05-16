import { buildApp } from "./app";
import { loadEnv } from "./config/env";
import { startCreateInvoiceWorker } from "./workers/createInvoice";

const env = loadEnv();
const app = await buildApp(env);
const workerRuntime = env.WORKER_ENABLED
  ? startCreateInvoiceWorker(env)
  : null;

async function shutdown(signal: NodeJS.Signals) {
  app.log.info({ signal }, "shutting down");
  await workerRuntime?.close();
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
