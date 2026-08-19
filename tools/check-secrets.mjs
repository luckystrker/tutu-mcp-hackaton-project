import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const TEXT_EXTENSIONS = new Set([
  ".env",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const ALLOWED_FILES = new Set(["package-lock.json", "tools/check-secrets.mjs"]);
const PATTERNS = [
  {
    name: "private key",
    value: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  { name: "AWS access key", value: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", value: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { name: "Telegram bot token", value: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/ },
  {
    name: "generic live secret",
    value:
      /(?:api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*["'][A-Za-z0-9_./+=-]{24,}["']/i,
  },
];

const { stdout } = await exec("git", ["ls-files", "-co", "--exclude-standard"]);
const findings = [];
for (const file of stdout.split("\n").filter(Boolean)) {
  if (ALLOWED_FILES.has(file) || !TEXT_EXTENSIONS.has(extname(file))) continue;
  const content = await readFile(file, "utf8").catch(() => "");
  for (const pattern of PATTERNS) {
    if (pattern.value.test(content)) findings.push(`${file}: ${pattern.name}`);
  }
}
if (findings.length > 0) {
  console.error(`Potential committed secrets:\n${findings.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("No committed secrets detected");
}
