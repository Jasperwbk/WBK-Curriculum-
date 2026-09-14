// Copies the Q1 curriculum source markdown into lib/curriculum-data/ so the
// deployed function actually has the files on disk at runtime — `firebase
// deploy` only uploads the functions/ directory, not the repo-level
// curriculum/ folder, so this runs as part of `npm run build` to keep the
// deployed copy in sync with the single source of truth automatically
// (never hand-duplicate these files).
const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "..", "..", "curriculum", "q1_fall");
const destDir = path.join(__dirname, "..", "lib", "curriculum-data");

fs.mkdirSync(destDir, { recursive: true });

const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".md"));
for (const file of files) {
  fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
}

console.log(`copy-curriculum-data: copied ${files.length} file(s) into lib/curriculum-data/`);
