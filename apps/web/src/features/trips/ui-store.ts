import { create } from "zustand";

type TripUiState = {
  selectedCityByTrip: Record<string, string>;
  selectCity(tripId: string, cityId: string): void;
};

export const useTripUi = create<TripUiState>((set) => ({
  selectedCityByTrip: {},
  selectCity: (tripId, cityId) =>
    set((state) => ({
      selectedCityByTrip: { ...state.selectedCityByTrip, [tripId]: cityId },
    })),
}));
