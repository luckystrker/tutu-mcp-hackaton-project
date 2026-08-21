import type { City, ParticipantGroupDto } from "@rendezvous/contracts";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { findNearestCity } from "../lib/geolocation.js";
import { currentLocale } from "../i18n/index.js";

type GeoState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "found"; message: string }
  | { status: "error"; message: string };

export function OriginMapPicker({
  cities,
  participants,
  selectedCityId,
  onSelect,
}: {
  cities: readonly City[];
  participants: readonly ParticipantGroupDto[];
  selectedCityId: string;
  onSelect: (cityId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [geoState, setGeoState] = useState<GeoState>({ status: "idle" });
  const selectedCity = cities.find(({ id }) => id === selectedCityId);
  const orderedCities = useMemo(
    () =>
      [...cities].sort((left, right) =>
        left.name.localeCompare(right.name, currentLocale()),
      ),
    [cities, i18n.resolvedLanguage],
  );

  function locate() {
    if (!navigator.geolocation) {
      setGeoState({
        status: "error",
        message: t("origin.unavailable"),
      });
      return;
    }
    setGeoState({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const nearest = findNearestCity(cities, coords);
        if (!nearest) {
          setGeoState({
            status: "error",
            message: t("origin.noNearby"),
          });
          return;
        }
        onSelect(nearest.city.id);
        setGeoState({
          status: "found",
          message:
            nearest.distanceKm <= 50
              ? t("origin.detected", { city: nearest.city.name })
              : t("origin.nearest", { city: nearest.city.name }),
        });
      },
      (positionError) => {
        setGeoState({
          status: "error",
          message:
            positionError.code === positionError.PERMISSION_DENIED
              ? t("origin.denied")
              : t("origin.failed"),
        });
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  return (
    <section className="origin-picker" aria-labelledby="origin-picker-title">
      <header className="origin-picker__header">
        <div>
          <h3 id="origin-picker-title">{t("origin.heading")}</h3>
          <p>{t("origin.description")}</p>
        </div>
        <button
          className="locate-button"
          type="button"
          onClick={locate}
          disabled={geoState.status === "locating"}
        >
          <LocateIcon />
          {geoState.status === "locating"
            ? t("origin.locating")
            : t("origin.myLocation")}
        </button>
      </header>

      <div className="origin-picker__selection" aria-live="polite">
        <span>{t("origin.selected")}</span>
        <strong>{selectedCity?.name ?? t("origin.choose")}</strong>
        {geoState.status !== "idle" && geoState.status !== "locating" && (
          <small className={`geo-feedback geo-feedback--${geoState.status}`}>
            {geoState.message}
          </small>
        )}
      </div>

      <OriginMap
        cities={cities}
        participants={participants}
        selectedCityId={selectedCityId}
        onSelect={onSelect}
      />

      <div className="map-legend" aria-label={t("origin.legend")}>
        <span>
          <i className="map-key map-key--hub" />
          {t("origin.hub")}
        </span>
        <span>
          <i className="map-key map-key--selected" />
          {t("origin.yourCity")}
        </span>
        <span>
          <i className="map-key map-key--friend" />
          {t("origin.friends")}
        </span>
      </div>

      <label className="origin-picker__select">
        {t("origin.list")}
        <select
          name="origin"
          value={selectedCityId}
          onChange={(event) => onSelect(event.currentTarget.value)}
        >
          {orderedCities.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </select>
      </label>
      <p className="origin-picker__privacy">{t("origin.privacy")}</p>
    </section>
  );
}

function OriginMap({
  cities,
  participants,
  selectedCityId,
  onSelect,
}: {
  cities: readonly City[];
  participants: readonly ParticipantGroupDto[];
  selectedCityId: string;
  onSelect: (cityId: string) => void;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const cityLayerRef = useRef<L.LayerGroup | null>(null);
  const friendLayerRef = useRef<L.LayerGroup | null>(null);
  const selectRef = useRef(onSelect);

  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const map = L.map(container, {
      center: [56, 66],
      zoom: 3,
      minZoom: 2,
      maxZoom: 10,
      zoomControl: false,
      worldCopyJump: true,
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer(
      import.meta.env.VITE_MAP_TILE_URL ??
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    ).addTo(map);
    cityLayerRef.current = L.layerGroup().addTo(map);
    friendLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const frame = window.requestAnimationFrame(() => map.invalidateSize());
    return () => {
      window.cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
      cityLayerRef.current = null;
      friendLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const cityLayer = cityLayerRef.current;
    const friendLayer = friendLayerRef.current;
    if (!map || !cityLayer || !friendLayer) return;
    cityLayer.clearLayers();
    friendLayer.clearLayers();

    for (const city of cities) {
      const selected = city.id === selectedCityId;
      const marker = L.circleMarker([city.lat, city.lon], {
        radius: selected
          ? 9
          : city.hubScore >= 90
            ? 6
            : city.hubScore >= 80
              ? 4
              : 2.5,
        color: selected ? "#24241f" : "#315846",
        weight: selected ? 3 : 1.5,
        fillColor: selected ? "#d9f96d" : "#315846",
        fillOpacity: selected ? 1 : city.hubScore >= 80 ? 0.88 : 0.5,
      });
      marker.bindTooltip(city.name, {
        direction: "top",
        permanent: city.hubScore >= 97,
        opacity: 0.94,
      });
      marker.on("click", () => selectRef.current(city.id));
      marker.addTo(cityLayer);
    }

    const cityById = new Map(cities.map((city) => [city.id, city]));
    const friendsByCity = new Map<string, string[]>();
    for (const participant of participants) {
      if (!participant.ready || !participant.originCityId) continue;
      const names = friendsByCity.get(participant.originCityId) ?? [];
      names.push(participant.displayName);
      friendsByCity.set(participant.originCityId, names);
    }
    for (const [cityId, names] of friendsByCity) {
      const city = cityById.get(cityId);
      if (!city) continue;
      const marker = L.marker([city.lat, city.lon], {
        icon: L.divIcon({
          className: "friend-map-dot",
          html: `<span>${names.length}</span>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
        keyboard: true,
        zIndexOffset: 600,
        title: `${city.name}: ${t("origin.friendCount", { count: names.length })}`,
      });
      const tooltip = document.createElement("span");
      tooltip.textContent = `${names.join(", ")} · ${city.name}`;
      marker.bindTooltip(tooltip, { direction: "top" });
      marker.addTo(friendLayer);
    }

    const selectedCity = cityById.get(selectedCityId);
    if (selectedCity) map.panTo([selectedCity.lat, selectedCity.lon]);
  }, [cities, participants, selectedCityId]);

  return (
    <div
      ref={containerRef}
      className="origin-map"
      role="application"
      aria-label={t("origin.mapLabel")}
    />
  );
}

function LocateIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}
