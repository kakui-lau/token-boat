import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { LanguageSwitcher } from "../language-switcher";

const changeLanguage = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { changeLanguage, resolvedLanguage: "zh" },
    t: (key: string) => key,
  }),
}));

describe("LanguageSwitcher", () => {
  test("shows the current language and switches to English from the menu", async () => {
    render(<LanguageSwitcher />);

    const trigger = screen.getByRole("button", { name: "Language" });
    expect(trigger).toHaveTextContent("中");

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByText("English"));

    expect(changeLanguage).toHaveBeenCalledWith("en");
  });
});
