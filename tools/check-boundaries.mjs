import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const root = new URL("../", import.meta.url);
const violations = [];

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

const rules = [
  {
    directory: "packages/contracts/src/",
    banned: ["fastify", "react", "@mastra/", "@rendezvous/domain", "pg"],
  },
  {
    directory: "apps/web/src/",
    banned: ["apps/api", "@rendezvous/tutu", "@mastra/", "pg"],
  },
];

for (const rule of rules) {
  for (const file of await sourceFiles(rule.directory)) {
    const contents = await readFile(new URL(file, root), "utf8");
    for (const dependency of rule.banned) {
      if (
        contents.includes(`from "${dependency}`) ||
        contents.includes(`from '${dependency}`)
      ) {
        violations.push(`${file} imports forbidden dependency ${dependency}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
}
