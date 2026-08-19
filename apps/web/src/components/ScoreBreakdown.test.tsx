// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScoreBreakdown } from "./ScoreBreakdown.js";

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
