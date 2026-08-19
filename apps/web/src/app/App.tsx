import { lazy, Suspense } from "react";
import { AppProviders } from "./providers.js";
import { AppRouter } from "./router.js";

const FixtureApp = lazy(() => import("./FixtureApp.js"));

export function App() {
  if (import.meta.env.VITE_API_MODE === "fixture")
    return (
      <Suspense fallback={null}>
        <FixtureApp />
      </Suspense>
    );
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
