import { defineConfig } from "@playwright/test";

/**
 * E2E do "assunto vs ação sugerida". Corre contra o servidor de
 * desenvolvimento já a correr em http://localhost:8080.
 */
export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    viewport: { width: 1280, height: 1800 },
    headless: true,
  },
  // Baselines visuais: criadas automaticamente quando faltam, comparadas
  // (e a falhar) sempre que já existem. Para reescrever de propósito:
  // bunx playwright test -c e2e/playwright.config.ts --update-snapshots
  updateSnapshots: "missing",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFileName}/{arg}{ext}",
  reporter: [["list"]],
});
