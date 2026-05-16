import { describe, expect, it } from "vitest";
import Fastify from "fastify";

import { errorHandlerPlugin } from "../src/plugins/errorHandler";
import { AppError } from "../src/lib/errors";

describe("error envelope", () => {
  it("serializes AppError with contract shape", async () => {
    const app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    app.get("/boom", async () => {
      throw ipNotAllowed();
    });

    const response = await app.inject({ method: "GET", url: "/boom" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "ip_not_allowed",
        message: "IP address is not allowed",
        details: {}
      }
    });
    await app.close();
  });
});

function ipNotAllowed(): AppError {
  return new AppError(403, "ip_not_allowed", "IP address is not allowed");
}
