import { createDemoFixture } from "@rendezvous/domain/fixtures";

const reference = process.env.DEMO_REFERENCE_TIME
  ? new Date(process.env.DEMO_REFERENCE_TIME)
  : new Date();
const fixture = createDemoFixture(reference);

process.stdout.write(
  `${JSON.stringify(
    {
      generatedAt: reference.toISOString(),
      mode: "demo-template",
      liveData: false,
      trip: fixture.trip,
      participants: fixture.participants.map(
        ({
          displayName,
          originCityId,
          availableFrom,
          mustReturnBy,
          maxBudget,
          forbiddenModes,
          softPreferences,
        }) => ({
          displayName,
          originCityId,
          availableFrom,
          mustReturnBy,
          maxBudget,
          forbiddenModes,
          softPreferences,
        }),
      ),
    },
    null,
    2,
  )}\n`,
);
