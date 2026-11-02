import { AxiosError, type AxiosResponse } from "axios";
import {
  documentError,
  isDocumentRevisionConflict,
  readableValidationMessage,
} from "../../../../frontend/src/lib/document-config";

const axiosFailure = (status: number, data: unknown): AxiosError =>
  new AxiosError("Request failed", undefined, undefined, undefined, {
    status,
    data,
  } as AxiosResponse);

describe("document error messages shown to the user", () => {
  it("names the field instead of the config path", () => {
    expect(
      readableValidationMessage(
        "Validation error for config.company.companyWebsite: Use a valid website",
        (field) => (field === "companyWebsite" ? "Company Website" : undefined),
      ),
    ).toBe("Company Website: Use a valid website");
  });

  it("falls back to the detail when the field has no label", () => {
    expect(
      readableValidationMessage(
        "Validation error for config.company.mystery: Too long",
        () => undefined,
      ),
    ).toBe("Too long");
  });

  it("leaves other messages untouched", () => {
    expect(readableValidationMessage("Preset changed.")).toBe(
      "Preset changed.",
    );
  });

  it("applies the field label to an API validation error", async () => {
    const error = axiosFailure(400, {
      error:
        "Validation error for config.company.companyWebsite: Use a valid website",
      errorCode: "VALIDATION_ERROR",
    });

    await expect(documentError(error, () => "Website")).resolves.toBe(
      "Website: Use a valid website",
    );
  });
});

describe("isDocumentRevisionConflict", () => {
  it("is true only for the stale-revision conflict code", () => {
    const stale = axiosFailure(409, {
      error: "Configuration changed.",
      errorCode: "DOCUMENT_REVISION_CONFLICT",
    });
    const limit = axiosFailure(409, {
      error: "Maximum 20 presets",
      errorCode: "HTTP_EXCEPTION",
    });

    expect(isDocumentRevisionConflict(stale)).toBe(true);
    expect(isDocumentRevisionConflict(limit)).toBe(false);
    expect(
      isDocumentRevisionConflict(
        axiosFailure(400, { errorCode: "DOCUMENT_REVISION_CONFLICT" }),
      ),
    ).toBe(false);
    expect(isDocumentRevisionConflict(new Error("boom"))).toBe(false);
  });
});
