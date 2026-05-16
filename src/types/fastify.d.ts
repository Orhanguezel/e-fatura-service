import type { FastifyRequest } from "fastify";

import type { Database, DatabasePool } from "../db/client";
import type { Tenant } from "../db/schema";

type AuthenticateHook = (request: FastifyRequest) => Promise<void>;

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    dbPool: DatabasePool;
    authenticate: AuthenticateHook;
    authenticateAdmin: AuthenticateHook;
  }

  interface FastifyRequest {
    tenant?: Tenant;
  }
}
