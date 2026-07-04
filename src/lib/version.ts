// Baked in at build time by CI (see .github/workflows/update-and-deploy.yml).
// Unset locally ("dev") since `npm run dev`/`next build` outside CI never sets these.
export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? null;
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? null;

export function formatBuildInfo(): string {
  if (!BUILD_SHA) return "bản dev";
  const time = BUILD_TIME
    ? new Date(BUILD_TIME).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })
    : null;
  return time ? `build ${BUILD_SHA} · ${time}` : `build ${BUILD_SHA}`;
}
