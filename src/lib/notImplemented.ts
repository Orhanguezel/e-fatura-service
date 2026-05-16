export function notImplementedResponse(message: string) {
  return {
    error: {
      code: "not_implemented" as const,
      message,
      details: {}
    }
  };
}
