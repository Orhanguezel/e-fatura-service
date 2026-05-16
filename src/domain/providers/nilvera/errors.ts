export class IntegratorError extends Error {
  readonly retryable: boolean;
  readonly code: string;
  readonly httpStatus: number | undefined;
  readonly raw: unknown;

  constructor(
    message: string,
    options: {
      retryable: boolean;
      code: string;
      httpStatus?: number | undefined;
      raw?: unknown;
    }
  ) {
    super(message);
    this.name = "IntegratorError";
    this.retryable = options.retryable;
    this.code = options.code;
    this.httpStatus = options.httpStatus;
    this.raw = options.raw;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mapAxiosError(error: unknown): IntegratorError {
  if (!isRecord(error) || !("isAxiosError" in error) || error.isAxiosError !== true) {
    return new IntegratorError(
      error instanceof Error ? error.message : "Unknown integrator error",
      { retryable: true, code: "integrator_error" }
    );
  }

  const response = isRecord(error.response) ? error.response : undefined;
  const status =
    typeof response?.status === "number" ? response.status : undefined;
  const data = response?.data;
  const message =
    isRecord(data) && typeof data.Message === "string"
      ? data.Message
      : typeof error.message === "string"
        ? error.message
        : "Nilvera request failed";

  if (status === 429 || status === undefined || status >= 500) {
    return new IntegratorError(message, {
      retryable: true,
      code: "integrator_error",
      httpStatus: status,
      raw: data
    });
  }

  if (status === 422) {
    return new IntegratorError(message, {
      retryable: false,
      code: "invoice_rule_violation",
      httpStatus: status,
      raw: data
    });
  }

  if (status === 400) {
    return new IntegratorError(message, {
      retryable: false,
      code: "validation_error",
      httpStatus: status,
      raw: data
    });
  }

  return new IntegratorError(message, {
    retryable: false,
    code: "integrator_error",
    httpStatus: status,
    raw: data
  });
}
