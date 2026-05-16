import { describe, expect, it } from "vitest";

import type { Invoice } from "../src/db/schema";
import { decideCancel } from "../src/domain/cancelRules";
import { AppError } from "../src/lib/errors";

function inv(
  partial: Partial<Pick<Invoice, "status" | "externalId" | "sentAt">>
): Pick<Invoice, "status" | "externalId" | "sentAt"> {
  return {
    status: "approved",
    externalId: "ext-1",
    sentAt: new Date("2026-05-10T00:00:00.000Z"),
    ...partial
  };
}

const now = new Date("2026-05-16T00:00:00.000Z"); // 6 gün sonra

describe("decideCancel", () => {
  it("pencere içi → void/cancelled/earsiv", () => {
    expect(decideCancel(inv({}), 7, now)).toEqual({
      action: "void",
      targetStatus: "cancelled",
      type: "earsiv"
    });
  });

  it("pencere dışı → refund/refunded/iade", () => {
    expect(
      decideCancel(
        inv({ sentAt: new Date("2026-05-01T00:00:00.000Z") }),
        7,
        now
      )
    ).toEqual({ action: "refund", targetStatus: "refunded", type: "iade" });
  });

  it("sent durumu da iptal edilebilir", () => {
    expect(decideCancel(inv({ status: "sent" }), 7, now).action).toBe("void");
  });

  it.each(["pending", "sending", "failed", "cancelled", "refunded"] as const)(
    "%s → 422",
    (status) => {
      expect(() => decideCancel(inv({ status }), 7, now)).toThrow(AppError);
    }
  );

  it("external_id / sent_at yoksa 422", () => {
    expect(() => decideCancel(inv({ externalId: null }), 7, now)).toThrow(
      "no integrator reference"
    );
    expect(() => decideCancel(inv({ sentAt: null }), 7, now)).toThrow(AppError);
  });
});
