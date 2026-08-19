import { FixtureRendezvousApi } from "../demo/fixtures.js";
import { useState } from "react";
import { AppProviders } from "./providers.js";
import { AppRouter } from "./router.js";

export default function FixtureApp() {
  const [api] = useState(() => new FixtureRendezvousApi());
  return (
    <AppProviders api={api}>
      <AppRouter />
    </AppProviders>
  );
}
