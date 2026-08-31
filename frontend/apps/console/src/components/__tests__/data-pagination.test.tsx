import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { DataPagination } from "../data-pagination";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (!values) return key;
      return Object.entries(values).reduce(
        (label, [name, value]) => label.replace(`{{${name}}}`, String(value)),
        key,
      );
    },
  }),
}));

describe("DataPagination", () => {
  test("reports the visible range and navigates with shadcn pagination controls", () => {
    const onPageChange = vi.fn();
    render(
      <DataPagination
        onPageChange={onPageChange}
        onPageSizeChange={vi.fn()}
        page={2}
        pageSize={20}
        total={95}
      />,
    );

    expect(screen.getByText("Showing 21–40 of 95 results")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    fireEvent.click(screen.getByRole("button", { name: "Last page" }));

    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 5);
  });

  test("disables navigation at a single-page boundary", () => {
    render(
      <DataPagination
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        page={1}
        pageSize={20}
        total={3}
      />,
    );

    expect(screen.getByRole("button", { name: "First page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Last page" })).toBeDisabled();
  });

  test("changes the server page size from the shadcn select", async () => {
    const onPageSizeChange = vi.fn();
    render(
      <DataPagination
        onPageChange={vi.fn()}
        onPageSizeChange={onPageSizeChange}
        page={1}
        pageSize={20}
        total={95}
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Rows per page" }));
    const option = await screen.findByRole("option", { name: "50" });
    fireEvent.pointerDown(option);
    fireEvent.pointerUp(option);
    fireEvent.click(option);

    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });
});
