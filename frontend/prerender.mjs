// Second half of `yarn build`: writes static HTML for the prerendered routes (the blog) into
// dist/, so crawlers and link previews that run no JavaScript get the content and each page's
// own meta tags. What is rendered, and how, lives in src/prerender/render.tsx.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

const frontendRoot = dirname(fileURLToPath(import.meta.url));
const distDir = join(frontendRoot, "dist");
// Under node_modules so the bundle resolves react and the rest exactly as the app does.
const serverBundleDir = join(frontendRoot, "node_modules", ".prerender");

// A target's path becomes a directory under dist/, and post slugs come from markdown frontmatter.
const SAFE_PATH = /^(\/[a-z0-9]+(-[a-z0-9]+)*)+$/;

async function loadRenderer() {
  await build({
    root: frontendRoot,
    logLevel: "warn",
    // Bundled in: the package ships its ES build as plain .js without declaring the module
    // type, which Node only loads by guessing from the syntax.
    ssr: { noExternal: ["react-helmet-async"] },
    build: {
      ssr: "src/prerender/render.tsx",
      outDir: serverBundleDir,
      emptyOutDir: true,
      copyPublicDir: false,
      // .mjs: under node_modules the bundle has no package.json to declare it an ES module.
      rollupOptions: {
        output: {
          entryFileNames: "[name].mjs",
          chunkFileNames: "chunks/[name]-[hash].mjs",
        },
      },
    },
  });
  return import(pathToFileURL(join(serverBundleDir, "render.mjs")).href);
}

async function writeTarget(template, target, renderToDocument) {
  if (!SAFE_PATH.test(target.path)) {
    throw new Error(`Refusing to prerender the unsafe path "${target.path}"`);
  }
  const file = join(distDir, target.path, "index.html");
  const html = await renderToDocument(template, target);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
}

async function main() {
  const template = await readFile(join(distDir, "index.html"), "utf8");
  try {
    const { prerenderTargets, renderToDocument } = await loadRenderer();
    // One at a time: rendering switches the shared i18n instance to the target's language.
    for (const target of prerenderTargets) {
      await writeTarget(template, target, renderToDocument);
    }
    process.stdout.write(`Prerendered ${prerenderTargets.length} pages into dist/\n`);
  } finally {
    await rm(serverBundleDir, { recursive: true, force: true });
  }
}

await main();
