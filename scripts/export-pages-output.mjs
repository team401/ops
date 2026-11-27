import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

// Keep existing Cloudflare Pages previews working while production/staging are
// cut over to the vinext Worker. cf deploy reads .cloudflare/output directly;
// Pages continues to publish the equivalent prerendered assets from out/.
const source = resolve(".cloudflare/output/v1/workers/default/assets");
const destination = resolve("out");

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
