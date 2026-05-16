import { describe, expect, it } from "vitest";

import { mapAxiosError } from "../../../src/domain/providers/nilvera/errors";

function axiosError(status: number | undefined, data?: unknown): unknown {
  return {
    isAxiosError: true,
    message: "request failed",
    response:
      status === undefined
        ? undefined
        : {
            status,
            data
          }
  };
}

describe("mapAxiosError", () => {
  it("marks 5xx and timeouts retryable", () => {
    expect(mapAxiosError(axiosError(503, { Message: "down" }))).toMatchObject({
      retryable: true,
      code: "integrator_error",
      httpStatus: 503,
      message: "down"
    });

    expect(mapAxiosError(axiosError(undefined))).toMatchObject({
      retryable: true,
      code: "integrator_error",
      httpStatus: undefined
    });
  });

  it("maps validation and rule failures as non-retryable", () => {
    expect(mapAxiosError(axiosError(400, { Message: "bad input" }))).toMatchObject({
      retryable: false,
      code: "validation_error",
      message: "bad input"
    });

    expect(mapAxiosError(axiosError(422, { Message: "rule" }))).toMatchObject({
      retryable: false,
      code: "invoice_rule_violation",
      message: "rule"
    });
  });
});
