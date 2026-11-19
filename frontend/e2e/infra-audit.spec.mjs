import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { Results } from "./support/runner.mjs";
const read = (path) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
export const run = async () => {
  const results = new Results("production configuration");
  const workflow = yaml.load(read("../../.github/workflows/ci.yml"));
  const compose = yaml.load(read("../../docker-compose.production.yml"));
  const publisher = workflow.jobs["build-and-deploy"];
  results.check(
    "15: publishing only runs for trusted main pushes",
    publisher.if?.includes("github.event_name == 'push'") &&
      publisher.if?.includes("github.ref == 'refs/heads/main'"),
    String(publisher.if),
  );
  for (const event of [
    { event_name: "pull_request", ref: "refs/pull/1/merge" },
    { event_name: "pull_request", ref: "refs/heads/main" },
    { event_name: "push", ref: "refs/heads/feature" },
    { event_name: "push", ref: "refs/heads/main" },
  ]) {
    const expected =
      event.event_name === "push" && event.ref === "refs/heads/main";
    const permits = (expression) =>
      typeof expression === "string" &&
      Function("github", `return (${expression})`)(event);
    results.check(
      `15: ${event.event_name} ${event.ref} publication/deployment=${expected}`,
      ["build-and-deploy", "deploy-production"].every(
        (job) => permits(workflow.jobs[job].if) === expected,
      ),
      "Event guard mismatch",
    );
  }
  const verificationJobs = Object.entries(workflow.jobs).filter(
    ([name]) => !["build-and-deploy", "deploy-production"].includes(name),
  );
  // No job installs from a private registry any more, so the workflow token
  // needs no `packages` scope: every scope it grants must stay read-only.
  results.check(
    "15: PR verification has a read-only token and no production secrets",
    workflow.permissions.contents === "read" &&
      Object.values(workflow.permissions).every(
        (access) => access === "read",
      ) &&
      verificationJobs.every(([, job]) =>
        [...JSON.stringify(job).matchAll(/secrets\.([A-Z_]+)/g)].every(
          (match) => match[1] === "GITHUB_TOKEN",
        ),
      ),
    "Untrusted verification receives production credentials or write permissions",
  );
  const builds = publisher.steps.filter((step) =>
    step.uses?.startsWith("docker/build-push-action"),
  );
  results.check(
    "15: both images publish the same SHA without latest",
    builds.length === 2 &&
      builds.every(
        (step) =>
          step.with.tags.includes("${{ github.sha }}") &&
          !step.with.tags.includes(":latest"),
      ),
    JSON.stringify(builds.map((step) => step.with.tags)),
  );
  results.check(
    "15: compose requires the same release tag for both images",
    ["frontend", "backend"].every((service) =>
      compose.services[service].image.includes("${IMAGE_TAG:?"),
    ),
    JSON.stringify(
      ["frontend", "backend"].map((service) => compose.services[service].image),
    ),
  );
  const deploymentSteps = workflow.jobs["deploy-production"].steps;
  const deploy = deploymentSteps
    .map((step) => step.with?.script || "")
    .join("\n");
  results.check(
    "15: release preserves production files and checks exact SHA archive",
    deploy.includes("sha256sum --check") &&
      !/git reset|cat > \.env|prune|remove-orphans/.test(deploy),
  );
  const dockerfile = read("../Dockerfile");
  results.check(
    "release marker is built from the immutable SHA",
    dockerfile.includes("ARG RELEASE_SHA=development") &&
      dockerfile.includes("dist/release.json") &&
      builds.some((step) =>
        step.with["build-args"]?.includes("RELEASE_SHA=${{ github.sha }}"),
      ),
  );
  const frontendBuild = builds.find(
    (step) => step.with.context === "./frontend",
  ).with["build-args"];
  results.check(
    "16: the frontend build takes the billing flag and no payment provider settings",
    dockerfile.includes("ARG VITE_BILLING_ENABLED=false") &&
      frontendBuild.includes("VITE_BILLING_ENABLED=") &&
      !/PADDLE|CREEM/.test(dockerfile + frontendBuild),
    "Unexpected frontend billing build settings",
  );
  // Dependencies come from the public registry only, so the build takes no
  // package token at all (no build arg, secret mount or .npmrc).
  results.check(
    "16: build context excludes local env files and the image build takes no package token",
    read("../.dockerignore").includes(".env.*") &&
      !/github_token|\.npmrc/i.test(dockerfile),
    "Environment or package credentials can enter an image layer",
  );
  const backendEnv = compose.services.backend.environment.join("\n");
  results.check(
    "16: production backend receives all Creem settings",
    [
      "CREEM_API_KEY",
      "CREEM_WEBHOOK_SECRET",
      "CREEM_PRO_PRODUCT_ID",
      "CREEM_BUSINESS_PRODUCT_ID",
      "CREEM_ENVIRONMENT",
      "FRONTEND_URL",
    ].every((key) => backendEnv.includes(`${key}=`)),
    "Missing backend/deployment settings",
  );
  const nginx = read("../nginx.conf");
  results.check(
    "16: unprefixed signed webhook goes straight to backend",
    /location = \/creem\/webhook\s*\{[^}]*proxy_pass http:\/\/api_backend;/s.test(
      nginx,
    ),
    "Missing exact webhook route",
  );
  results.check(
    "17: Socket.IO has upgraded and polling transport proxy",
    /location \^~ \/socket.io\/\s*\{[^}]*proxy_pass http:\/\/api_backend;[^}]*Upgrade \$http_upgrade;[^}]*Connection \$connection_upgrade;/s.test(
      nginx,
    ),
    "Missing transport proxy",
  );
  return results;
};
