import * as fs from "fs";
import * as path from "path";

const CONFIG = fs.readFileSync(
  path.join(__dirname, "../../../../frontend/nginx.conf"),
  "utf-8",
);

/** The body of `location ^~ /r/ { ... }` (no nested braces in it). */
const shareLocation = (): string => {
  const match = /location \^~ \/r\/ \{([^}]*)\}/.exec(CONFIG);
  if (!match) throw new Error("nginx.conf has no `location ^~ /r/` block");
  return match[1];
};

describe("public share page /r/:token in nginx.conf", () => {
  it("never leaks the token in a Referer and is kept out of search indexes", () => {
    const block = shareLocation();
    expect(block).toMatch(/add_header Referrer-Policy "no-referrer" always;/);
    expect(block).toMatch(
      /add_header X-Robots-Tag "noindex, nofollow" always;/,
    );
  });

  it("repeats the server-level security headers, which add_header in a location replaces", () => {
    const block = shareLocation();
    for (const header of [
      "X-Frame-Options",
      "X-Content-Type-Options",
      "X-XSS-Protection",
    ])
      expect(block).toContain(`add_header ${header} `);
  });

  it("still serves the single-page app", () => {
    expect(shareLocation()).toMatch(/try_files [^;]*\/index\.html/);
  });
});
