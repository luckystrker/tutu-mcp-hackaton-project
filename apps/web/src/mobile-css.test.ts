import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("mobile CSS contract", () => {
  it("covers narrow screens, safe areas and reduced motion", async () => {
    const css = await readFile(
      new URL("./styles.css", import.meta.url),
      "utf8",
    );
    expect(css).toContain("@media (max-width: 359px)");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".compute-banner--running .compute-banner__pulse");
    expect(css).toContain("animation: none");
  });
});
