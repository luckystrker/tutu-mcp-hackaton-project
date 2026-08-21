import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const root = new URL("../", import.meta.url);
const violations = [];
const allowed = [
  "apps/web/src/i18n/",
  "apps/web/src/demo/",
  "apps/web/src/lib/trip-titles.ts",
  "apps/web/src/features/trips/natural-preference.ts",
];

async function sourceFiles(directory) {
  const entries = await readdir(new URL(directory, root), {
    withFileTypes: true,
  });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(`${path}/`)));
    else if ([".ts", ".tsx"].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

for (const file of await sourceFiles("apps/web/src/")) {
  if (
    file.includes(".test.") ||
    allowed.some((prefix) => file.startsWith(prefix))
  )
    continue;
  const contents = await readFile(new URL(file, root), "utf8");
  if (/[А-Яа-яЁё]/u.test(contents))
    violations.push(
      `${file} contains hardcoded Cyrillic outside locale resources`,
    );
}

const resources = await readFile(
  new URL("apps/web/src/i18n/resources.ts", root),
  "utf8",
);
const englishResource = resources
  .slice(0, resources.indexOf("export const ru"))
  .replaceAll('"Русский"', '"Russian"');
if (/[А-Яа-яЁё]/u.test(englishResource))
  violations.push("English locale resource contains Cyrillic text");

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
}
