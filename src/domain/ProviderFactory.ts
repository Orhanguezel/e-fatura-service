import type { IntegratorDriver, Tenant } from "../db/schema";
import { decryptSecret } from "../lib/crypto";
import type { InvoiceProvider } from "./InvoiceProvider";
import { parseIntegratorCredentials, type ProviderContext } from "./types";
import { EdmProvider } from "./providers/EdmProvider";
import { NilveraProvider } from "./providers/NilveraProvider";

export type ProviderFactoryOptions = {
  encryptionKey: string;
  logger?: ProviderContext["logger"];
  nilveraMockMode?: boolean;
};

export type ProviderResolution = {
  provider: InvoiceProvider;
  context: ProviderContext;
};

const noopLogger: ProviderContext["logger"] = {
  info: () => undefined,
  error: () => undefined
};

function credentialString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function createProviderResolution(
  tenant: Tenant,
  options: ProviderFactoryOptions
): ProviderResolution {
  const credentials = parseIntegratorCredentials(
    decryptSecret(tenant.integratorCredentials, options.encryptionKey)
  );
  const driver: IntegratorDriver = tenant.integratorDriver;
  const context: ProviderContext = {
    credentials,
    mode: tenant.mode,
    logger: options.logger ?? noopLogger
  };

  switch (driver) {
    case "nilvera": {
      const defaultBaseUrl =
        tenant.mode === "test"
          ? "https://apitest.nilvera.com"
          : "https://api.nilvera.com";

      const apiKey = credentialString(
        credentials.api_key ?? credentials.apiKey,
        ""
      );

      return {
        provider: new NilveraProvider(
          apiKey,
          credentialString(
            credentials.base_url ?? credentials.baseUrl,
            defaultBaseUrl
          ),
          options.nilveraMockMode ?? (tenant.mode === "test" && apiKey.length === 0)
        ),
        context
      };
    }
    case "edm":
      return {
        provider: new EdmProvider(),
        context
      };
  }
}

export function createInvoiceProvider(
  tenant: Tenant,
  options: ProviderFactoryOptions
): InvoiceProvider {
  return createProviderResolution(tenant, options).provider;
}
