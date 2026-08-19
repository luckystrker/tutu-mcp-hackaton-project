import type { ParticipantGroupDto, PublicCity } from "@rendezvous/contracts";

export function ParticipantSpokes({
  participants,
  city,
}: {
  participants: readonly ParticipantGroupDto[];
  city: PublicCity;
}) {
  return (
    <div className="spokes" aria-label={`Участники едут в ${city.name}`}>
      <div className="spokes__city">
        <small>встречаемся</small>
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
