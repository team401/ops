import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "team401-ops",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-27",
    assets: {
      notFoundHandling: "none",
      runWorkerFirst: ["/_vinext/static-cache/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),
    },
  }),
});
