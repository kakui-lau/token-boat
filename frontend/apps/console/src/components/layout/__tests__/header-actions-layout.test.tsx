import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { HeaderActions } from "../header-actions";

describe("HeaderActions", () => {
  test("pushes the account action group to the far edge of the header", () => {
    render(
      <HeaderActions>
        <button type="button">Account</button>
      </HeaderActions>,
    );

    expect(screen.getByText("Account").parentElement).toHaveClass("ml-auto", "shrink-0");
  });
});
