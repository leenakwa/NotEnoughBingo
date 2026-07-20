import { describe, expect, it } from "vitest";

import { ApiClientError, errorMessage } from "@/lib/api/client";

describe("API error presentation", () => {
  it("surfaces the first field-level validation message", () => {
    const error = new ApiClientError(400, {
      code: "validation_error",
      message: "The request could not be processed.",
      details: {
        new_password: [{ message: "This password is too common.", code: "password_too_common" }],
      },
    });

    expect(errorMessage(error)).toBe("new password: This password is too common.");
  });

  it("keeps the safe envelope message when no field detail exists", () => {
    const error = new ApiClientError(503, {
      code: "service_unavailable",
      message: "The service is temporarily unavailable.",
    });

    expect(errorMessage(error)).toBe("The service is temporarily unavailable.");
  });

  it("turns browser network failures into an actionable message", () => {
    expect(errorMessage(new TypeError("Failed to fetch"))).toBe(
      "Unable to reach the service. Check your connection and try again.",
    );
  });
});
