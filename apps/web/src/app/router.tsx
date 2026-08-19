import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import {
  ComparePage,
  DestinationPage,
  FinalTripPage,
  JoinPage,
  LiveRoomPage,
  PreferencesPage,
  ShortlistPage,
  StartPage,
} from "../pages/TripPages.js";

export const router = createBrowserRouter([
  { path: "/", element: <StartPage /> },
  { path: "/join/:inviteToken", element: <JoinPage /> },
  { path: "/trips/:tripId/me", element: <PreferencesPage /> },
  { path: "/trips/:tripId/live", element: <LiveRoomPage /> },
  { path: "/trips/:tripId/cities/:cityId", element: <DestinationPage /> },
  { path: "/trips/:tripId/compare", element: <ComparePage /> },
  { path: "/trips/:tripId/shortlist", element: <ShortlistPage /> },
  { path: "/trips/:tripId/final", element: <FinalTripPage /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
