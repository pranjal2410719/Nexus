import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));

export async function resolve(specifier, context, nextResolve) {
  // If specifier starts with @/
  if (specifier.startsWith("@/")) {
    const relative = specifier.slice(2);
    const basePath = join(PROJECT_ROOT, relative);
    const candidates = [
      `${basePath}.ts`,
      `${basePath}.tsx`,
      `${basePath}.js`,
      `${basePath}/index.ts`,
      `${basePath}/index.js`,
      basePath,
    ];
    for (const c of candidates) {
      if (existsSync(c)) {
        return nextResolve(pathToFileURL(c).href, context);
      }
    }
  }

  // If relative specifier without extension
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    try {
      return await nextResolve(specifier, context);
    } catch (err) {
      if (err.code === "ERR_MODULE_NOT_FOUND" && context.parentURL) {
        const resolvedBase = new URL(specifier, context.parentURL);
        const basePath = fileURLToPath(resolvedBase);
        const candidates = [
          `${basePath}.ts`,
          `${basePath}.tsx`,
          `${basePath}.js`,
          `${basePath}/index.ts`,
          `${basePath}/index.js`,
        ];
        for (const c of candidates) {
          if (existsSync(c)) {
            return nextResolve(pathToFileURL(c).href, context);
          }
        }
      }
      throw err;
    }
  }

  return nextResolve(specifier, context);
}
