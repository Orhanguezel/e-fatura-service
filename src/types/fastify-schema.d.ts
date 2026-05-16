import "fastify";

declare module "fastify" {
  interface FastifySchema {
    tags?: string[];
    security?: Array<Record<string, string[]>>;
  }
}
