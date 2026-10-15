// Isolated actual React/Axios/Query UI, synthetic HTTP state, no real services.
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const esbuild = require("esbuild");
const project = path.resolve(__dirname, "../..");
const output = path.resolve(
  process.env.SETTINGS_EVIDENCE ||
    path.join(project, "backend/temp/template-settings-browser"),
);
const port = Number(process.env.SETTINGS_PORT || 4318);
const baseline = process.env.SETTINGS_BASELINE;
const initialCompany = {
  companyName: "Saved LLC",
  companyAddress: "123 Saved Street",
  companyEmail: "saved@example.com",
  companyPhone: "+380501234567",
  companyTaxId: "TAX-SAVED",
  companyIban: "UA000111",
  companySwift: "SWIFTXYZ",
  companyWebsite: "saved.example.com",
  companyTagline: "Saved tagline",
};
const defaults = {
  receiptTitle: "Invoice",
  hasCustomReceiptTitle: true,
  templateId: "standard",
  templateLanguage: "uk",
  footerTitle: "Thank you!",
  footerSubtitle: "Contact us",
  primaryColor: "",
  paymentTerms: "Net 30",
  deliveryTerms: "EXW",
};
let design = { ...defaults },
  company = { ...initialCompany },
  requests = [],
  failures = {},
  hasLogo = false;
const fields = {
  "receipt-title": "receiptTitle",
  "footer-title": "footerTitle",
  "footer-subtitle": "footerSubtitle",
  "primary-color": "primaryColor",
  "payment-terms": "paymentTerms",
  "delivery-terms": "deliveryTerms",
  template: "templateId",
  "template-language": "templateLanguage",
};
const templates = [
  "standard",
  "compact",
  "thermal",
  "minimal",
  "branded",
  "proforma",
  "delivery",
].map((id) => ({
  id,
  name: id.toUpperCase(),
  description: id + " design",
  category: "business",
  features: ["PDF"],
  colors: { primary: "#3B82F6", secondary: "#222222", accent: "#eeeeee" },
  locked: false,
}));
function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}
function displayDesign() {
  if (design.hasCustomReceiptTitle && design.receiptTitle.trim()) return design;
  const lang = design.templateLanguage;
  const titles = {
    standard: { en: "Invoice", ru: "Инвойс", uk: "Інвойс" },
    delivery: {
      en: "Delivery Note",
      ru: "Накладная",
      uk: "Видаткова накладна",
    },
    proforma: {
      en: "Proforma Invoice",
      ru: "Проформа-инвойс",
      uk: "Проформа-інвойс",
    },
  };
  return {
    ...design,
    receiptTitle: (titles[design.templateId] || titles.standard)[lang],
  };
}
(async () => {
  const png = await require("sharp")({
    create: { width: 10, height: 10, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  fs.mkdirSync(output, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(project, "frontend/e2e/fixtures/settings.tsx")],
    bundle: true,
    outfile: path.join(output, "fixture.js"),
    format: "iife",
    jsx: "automatic",
    define: {
      "import.meta.env": "{}",
      "import.meta.env.VITE_BILLING_ENABLED": '"false"',
      "import.meta.env.VITE_API_URL": JSON.stringify(
        `http://127.0.0.1:${port}/api/v1`,
      ),
      "import.meta.env.VITE_API_KEY": '"fixture"',
      "import.meta.env.PROD": "false",
    },
    plugins: baseline
      ? [
          {
            name: "baseline-source",
            setup(build) {
              build.onLoad({ filter: /\.[tj]sx?$/ }, async (args) => {
                const candidate = path.join(
                  baseline,
                  path.relative(project, args.path),
                );
                if (fs.existsSync(candidate))
                  return {
                    contents: fs.readFileSync(candidate, "utf8"),
                    loader: args.path.endsWith("tsx") ? "tsx" : "ts",
                  };
              });
            },
          },
        ]
      : [],
  });
  http
    .createServer(async (req, res) => {
      let body = "";
      for await (const x of req) body += x;
      const url = new URL(req.url, "http://localhost");
      let data;
      try {
        data = body ? JSON.parse(body) : {};
      } catch {
        data = {};
      }
      if (url.pathname === "/__fixture/state")
        return json(res, { design, company, requests, hasLogo });
      if (url.pathname === "/__fixture/reset") {
        design = { ...defaults, ...data.design };
        company = { ...initialCompany, ...data.company };
        hasLogo = !!data.hasLogo;
        requests = [];
        failures = {};
        return json(res, { ok: true });
      }
      if (url.pathname === "/__fixture/fail") {
        failures = { ...failures, ...data };
        return json(res, { ok: true });
      }
      requests.push({
        method: req.method,
        path: url.pathname,
        query: url.search,
        body: data,
      });
      const error = failures[req.method + " " + url.pathname];
      if (error)
        return json(
          res,
          { error: "Synthetic failure", errorCode: "INTERNAL_SERVER_ERROR" },
          500,
        );
      if (url.pathname === "/api/v1/settings/receipt-design")
        return json(res, { data: displayDesign() });
      if (url.pathname === "/api/v1/settings/company-info") {
        if (req.method === "POST") {
          company = { ...company, ...data };
          return json(res, { message: "updated" });
        }
        return json(res, { data: company });
      }
      if (url.pathname === "/api/v1/settings/templates")
        return json(res, { data: templates });
      if (
        url.pathname === "/api/v1/settings/template-language" &&
        req.method === "GET"
      )
        return json(res, { data: { language: design.templateLanguage } });
      if (url.pathname === "/api/v1/settings/footer" && req.method === "POST") {
        design = { ...design, ...data };
        return json(res, { message: "updated" });
      }
      const field = fields[url.pathname.split("/").pop()];
      if (field && req.method === "POST") {
        const value = data[field] ?? data.title ?? data.language;
        design = { ...design, [field]: value };
        if (field === "receiptTitle")
          design.hasCustomReceiptTitle = Boolean(value.trim());
        return json(res, { message: "updated" });
      }
      if (url.pathname === "/api/v1/settings/logo") {
        if (!hasLogo) return json(res, { error: "Logo not found" }, 404);
        res.writeHead(200, { "Content-Type": "image/png" });
        return res.end(png);
      }
      if (url.pathname === "/api/v1/settings/logo/upload") {
        hasLogo = true;
        return json(res, { message: "updated" });
      }
      if (url.pathname === "/api/v1/pdf-test/preview-template") {
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end(
          '<!doctype html><html lang="' +
            url.searchParams.get("language") +
            '"><body>Generic preview</body></html>',
        );
      }
      if (url.pathname === "/style.css") {
        const assets = path.join(project, "frontend/dist/assets");
        const file = fs
          .readdirSync(assets)
          .find((name) => name.endsWith(".css"));
        res.writeHead(200, { "Content-Type": "text/css" });
        return res.end(fs.readFileSync(path.join(assets, file)));
      }
      if (url.pathname === "/fixture.js") {
        res.writeHead(200, { "Content-Type": "text/javascript" });
        return res.end(fs.readFileSync(path.join(output, "fixture.js")));
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>',
      );
    })
    .listen(port, "127.0.0.1", () =>
      console.log(
        `Settings regression fixture http://127.0.0.1:${port} ${baseline ? "BASELINE" : "CURRENT"}`,
      ),
    );
})();
