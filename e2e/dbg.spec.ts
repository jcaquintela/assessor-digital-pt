import { test } from "@playwright/test";
test("dbg", async ({ page }) => {
  const base = "http://localhost:8080";
  const COOKIES = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;
  if (COOKIES) await page.context().addCookies(JSON.parse(COOKIES).map((c: Record<string, unknown>) => ({ ...c, url: base })));
  await page.goto("/");
  await page.evaluate(([k, v]) => window.localStorage.setItem(k as string, v as string), [process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY!, process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON!]);
  await page.goto("/hoje");
  await page.waitForLoadState("networkidle");
  console.log("URL:", page.url());
  console.log("h1:", await page.locator("h1").count(), await page.locator("h1").allInnerTexts());console.log("navPessoas:", await page.getByRole("link", { name: "Pessoas", exact: true }).count());
});
