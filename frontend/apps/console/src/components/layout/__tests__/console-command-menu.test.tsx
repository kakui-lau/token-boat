import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import ConsoleCommandMenu from "../console-command-menu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      changeLanguage: vi.fn(),
      resolvedLanguage: "zh",
    },
    t: (key: string) => key,
  }),
}));

function TestIcon(props: { className?: string }) {
  return <svg aria-hidden="true" className={props.className} />;
}

describe("console command menu", () => {
  test("filters navigation items and shows the shadcn command empty state", () => {
    render(
      <ConsoleCommandMenu
        actions={[]}
        navigationGroups={[
          {
            label: "Workspace",
            items: [{ icon: TestIcon, label: "Overview", to: "/" }],
          },
        ]}
        onNavigate={vi.fn()}
        onOpenChange={vi.fn()}
        open
      />,
    );

    expect(screen.getByText("Overview")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Type to search..."), {
      target: { value: "missing-page" },
    });
    expect(screen.getByText("No matching pages")).toBeInTheDocument();
  });

  test("selecting a command delegates typed navigation to the shell", () => {
    const onNavigate = vi.fn();
    render(
      <ConsoleCommandMenu
        actions={[]}
        navigationGroups={[
          {
            label: "Develop",
            items: [{ icon: TestIcon, label: "API keys", to: "/api-keys" }],
          },
        ]}
        onNavigate={onNavigate}
        onOpenChange={vi.fn()}
        open
      />,
    );

    fireEvent.click(screen.getByText("API keys"));
    expect(onNavigate).toHaveBeenCalledWith("/api-keys");
  });

  test("searches and runs a quick action before closing the menu", () => {
    const onOpenChange = vi.fn();
    const onSelect = vi.fn();
    render(
      <ConsoleCommandMenu
        actions={[
          {
            checked: true,
            icon: TestIcon,
            id: "theme-dark",
            keywords: ["Appearance"],
            label: "Use dark theme",
            onSelect,
          },
        ]}
        navigationGroups={[]}
        onNavigate={vi.fn()}
        onOpenChange={onOpenChange}
        open
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Type to search..."), {
      target: { value: "Appearance" },
    });
    fireEvent.click(screen.getByText("Use dark theme"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
