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

/** Body of `location /api/ { ... }`, nested `if { }` blocks included. */
const apiLocation = (): string => {
  const start = CONFIG.indexOf("location /api/ {");
  if (start < 0) throw new Error("nginx.conf has no `location /api/` block");
  let depth = 0;
  for (let index = CONFIG.indexOf("{", start); index < CONFIG.length; index++) {
    if (CONFIG[index] === "{") depth++;
    if (CONFIG[index] === "}" && --depth === 0)
      return CONFIG.slice(start, index);
  }
  throw new Error("unterminated `location /api/` block");
};

describe("upload size limit in nginx.conf", () => {
  it("lets /api/ take the 6 MiB document requests instead of nginx's 1m default", () => {
    const match = /client_max_body_size\s+(\d+)m;/.exec(apiLocation());
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(7);
  });
});

describe("client address and API rate limit in nginx.conf", () => {
  it("restores the client address from Cloudflare only for Cloudflare peers", () => {
    expect(CONFIG).toMatch(/^real_ip_header CF-Connecting-IP;$/m);
    expect(CONFIG).toMatch(/^real_ip_recursive off;$/m);
    const trusted = [...CONFIG.matchAll(/^set_real_ip_from (\S+);$/gm)].map(
      (match) => match[1],
    );
    expect(trusted).toEqual(
      expect.arrayContaining(["173.245.48.0/20", "2606:4700::/32"]),
    );
    // Trusting everyone would let a direct hit on the origin pick its own address.
    expect(trusted).not.toContain("0.0.0.0/0");
    expect(trusted).not.toContain("::/0");
  });

  it("limits /api/ per client with a 429 in the API's RATE_LIMITED shape", () => {
    expect(CONFIG).toMatch(
      /limit_req_zone \$binary_remote_addr zone=api:\S+ rate=10r\/s;/,
    );
    expect(CONFIG).toMatch(/^limit_req_status 429;$/m);
    expect(apiLocation()).toMatch(/limit_req zone=api burst=\d+ nodelay;/);
    expect(CONFIG).toMatch(
      /location @rate_limited \{[^}]*"errorCode":"RATE_LIMITED"/,
    );
    // Socket.IO polling and Paddle's few sender addresses stay outside the limit.
    expect(CONFIG.match(/limit_req zone=/g)).toHaveLength(1);
  });
});
