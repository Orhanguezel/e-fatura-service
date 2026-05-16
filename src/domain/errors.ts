export class ProviderNotImplementedError extends Error {
  readonly driver: string;

  constructor(driver: string) {
    super(`Integrator driver "${driver}" is not implemented yet`);
    this.name = "ProviderNotImplementedError";
    this.driver = driver;
  }
}
