/**
 * Deployment environment, baked in at build time via the `VITE_DEPLOY_ENV`
 * define in `vite.config.ts` (from Vercel's VERCEL_ENV; plain local runs are
 * "development").
 */
export const DEPLOY_ENV: string =
  import.meta.env.VITE_DEPLOY_ENV || "development";

const FAVICON_SUFFIX_BY_ENV: Record<string, string> = {
  production: "",
  preview: "-preview",
  development: "-dev",
};

/**
 * Suffix selecting the environment-tinted tab favicon set (terracotta prod,
 * purple preview/staging, blue dev — see scripts/generate-icons.mjs), so
 * tabs from different environments are distinguishable at a glance.
 */
export const FAVICON_SUFFIX: string =
  FAVICON_SUFFIX_BY_ENV[DEPLOY_ENV] ?? "-dev";
