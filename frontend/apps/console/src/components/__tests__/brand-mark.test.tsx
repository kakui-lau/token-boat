import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrandMark } from "@/components/brand-mark";

describe("BrandMark", () => {
  it("renders the shared Token Boat logo from the console base path", () => {
    render(<BrandMark alt="Token Boat" className="size-10" />);

    const logo = screen.getByRole("img", { name: "Token Boat" });
    expect(logo).toHaveAttribute("src", `${import.meta.env.BASE_URL}brand/token-boat-logo-512.png`);
    expect(logo).toHaveAttribute("height", "512");
    expect(logo).toHaveAttribute("width", "512");
    expect(logo).toHaveClass("size-10");
  });
});
