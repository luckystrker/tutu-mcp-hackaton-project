import type { ParticipantGroupDto, PublicCity } from "@rendezvous/contracts";
import { useTranslation } from "react-i18next";

export function ParticipantSpokes({
  participants,
  city,
}: {
  participants: readonly ParticipantGroupDto[];
  city: PublicCity;
}) {
  const { t } = useTranslation();
  return (
    <div className="spokes" aria-label={t("spokes.label", { city: city.name })}>
      <div className="spokes__city">
        <small>{t("spokes.meet")}</small>
        <strong>{city.name}</strong>
      </div>
      {participants.map((participant, index) => (
        <div
          className={`spokes__person spokes__person--${index + 1}`}
          key={participant.id}
        >
          <span>{participant.displayName.slice(0, 1)}</span>
          <small>{participant.displayName}</small>
        </div>
      ))}
    </div>
  );
}
