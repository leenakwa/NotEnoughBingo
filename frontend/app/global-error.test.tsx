import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import GlobalError from "@/app/global-error";

describe("root error fallback", () => {
  it("renders a complete, usable document without exposing the error message", () => {
    const markup = renderToStaticMarkup(
      <GlobalError error={new Error("internal database detail")} reset={() => undefined} />,
    );

    expect(markup).toContain('<html lang="en">');
    expect(markup).toContain("<body");
    expect(markup).toContain("This page could not be loaded");
    expect(markup).toContain("Try again");
    expect(markup).toContain('href="/discover"');
    expect(markup).not.toContain("internal database detail");
  });
});
