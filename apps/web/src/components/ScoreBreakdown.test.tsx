// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import i18n from "../i18n/index.js";
import { ScoreBreakdown } from "./ScoreBreakdown.js";

beforeAll(() => i18n.changeLanguage("ru"));
afterAll(() => i18n.changeLanguage("en"));

describe("ScoreBreakdown", () => {
  it("renders every explainable score component", () => {
    render(
      <ScoreBreakdown
        scores={{
          together: 91,
          cost: 82,
          travel: 76,
          synchronization: 88,
          fairness: 93,
        }}
      />,
    );
    expect(screen.getByText("Время вместе")).toBeTruthy();
    expect(screen.getByText("Стоимость")).toBeTruthy();
    expect(screen.getByText("Справедливость")).toBeTruthy();
  });
});
