export type ApiErrorCode =
  | "validation_error"
  | "unauthorized"
  | "ip_not_allowed"
  | "tenant_inactive"
  | "invoice_not_found"
  | "idempotency_conflict"
  | "invoice_rule_violation"
  | "rate_limited"
  | "pdf_not_ready"
  | "integrator_error"
  | "service_unavailable"
  | "webhook_unreachable"
  | "not_implemented"
  | "internal_server_error"
  | "request_error";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function unauthorized(message = "Invalid or missing API key"): AppError {
  return new AppError(401, "unauthorized", message);
}

export function ipNotAllowed(): AppError {
  return new AppError(403, "ip_not_allowed", "IP address is not allowed");
}

export function tenantInactive(): AppError {
  return new AppError(403, "tenant_inactive", "Tenant is inactive");
}
