/**
 * Writes the downloadable brand files into `public/` from the single mark
 * definition in `packages/core/src/lib/brand.ts`:
 *
 *   public/logo.svg   the mark, vector
 *   public/logo.png   the mark, 512 × 512 (GitHub and other OAuth app consoles)
 *
 * Run `pnpm --filter @ostiary/auth brand:assets` after changing the mark,
 * and commit the output.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

import { logoMarkSvg } from "../../../packages/core/src/lib/brand";

// Run through the app's `brand:assets` script, so the working directory is apps/auth.
const publicDir = join(process.cwd(), "public");

async function main() {
  const svg = logoMarkSvg({ size: 512 });
  await writeFile(join(publicDir, "logo.svg"), `${svg}\n`);
  // Rasterize from the vector at 4× density so curves stay crisp at 512 px.
  await sharp(Buffer.from(svg), { density: 288 }).resize(512, 512).png().toFile(join(publicDir, "logo.png"));
  console.log("wrote public/logo.svg and public/logo.png");
}

void main();
