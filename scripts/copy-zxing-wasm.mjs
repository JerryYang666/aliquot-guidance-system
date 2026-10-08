// Serves the Data Matrix decoder's WebAssembly from our own origin instead of
// the jsDelivr CDN that zxing-wasm defaults to. Runs on `npm install`.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(
  root,
  "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
);
const target = join(root, "public/zxing/zxing_reader.wasm");

if (existsSync(source)) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}
