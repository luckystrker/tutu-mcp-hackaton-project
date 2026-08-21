import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import {
  ComparePage,
  CreateTripPage,
  DestinationPage,
  FinalTripPage,
  JoinPage,
  InvitePage,
  LiveRoomPage,
  PreferencesPage,
  ShortlistPage,
  StartPage,
  TripMenuPage,
  TripsPage,
} from "../pages/TripPages.js";
import { SettingsPage } from "../pages/SettingsPage.js";

export const router = createBrowserRouter([
  { path: "/", element: <StartPage /> },
  { path: "/new", element: <CreateTripPage /> },
  { path: "/trips", element: <TripsPage /> },
  { path: "/settings", element: <SettingsPage /> },
  { path: "/join/:inviteToken", element: <JoinPage /> },
  { path: "/trips/:tripId/me", element: <PreferencesPage /> },
  { path: "/trips/:tripId/live", element: <LiveRoomPage /> },
  { path: "/trips/:tripId/cities/:cityId", element: <DestinationPage /> },
  { path: "/trips/:tripId/compare", element: <ComparePage /> },
  { path: "/trips/:tripId/shortlist", element: <ShortlistPage /> },
  { path: "/trips/:tripId/final", element: <FinalTripPage /> },
  { path: "/trips/:tripId/invite", element: <InvitePage /> },
  { path: "/trips/:tripId/menu", element: <TripMenuPage /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
