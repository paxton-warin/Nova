import fs from "node:fs";
import path from "node:path";

const distIndexPath = path.resolve("dist/index.html");
const html = fs.readFileSync(distIndexPath, "utf8");

let next = html
  .replace(/<title>.*?<\/title>/, "<title>Nova Browser</title>")
  .replace(
    /<meta name="description" content=".*?" \/>/,
    '<meta name="description" content="Nova is a modern, full-stack proxy browser with accounts, themes, settings sync, and admin moderation." />',
  )
  .replace(
    /<meta name="author" content=".*?" \/>/,
    '<meta name="author" content="Nova" />',
  )
  .replace(
    /<link rel="icon" href=".*?" type="image\/svg\+xml" \/>/,
    `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌐</text></svg>" />`,
  )
  .replace(
    /<meta property="og:title" content=".*?" \/>/,
    '<meta property="og:title" content="Nova Browser" />',
  )
  .replace(
    /<meta property="og:description" content=".*?" \/>/,
    '<meta property="og:description" content="A modern full-stack browser shell with proxy support." />',
  );

if (!next.includes('/baremux/index.js')) {
  next = next.replace(
    /(\s*<script type="module" crossorigin src="\/assets\/.*?<\/script>)/,
    '\n    <script src="/scram/scramjet.all.js"></script>\n    <script src="/baremux/index.js"></script>$1',
  );
}

fs.writeFileSync(distIndexPath, next);
