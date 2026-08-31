import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Button } from "@token-boat/ui/components/ui/button";
import { Table, TableBody } from "@token-boat/ui/components/ui/table";
import { TableEmptyState } from "../table-empty-state";

describe("TableEmptyState", () => {
  test("keeps the table structure and spans every visible column", () => {
    const { container } = render(
      <Table>
        <TableBody>
          <TableEmptyState
            action={<Button>Create item</Button>}
            colSpan={5}
            description="Adjust the filters or create the first item."
            title="No matching items"
          />
        </TableBody>
      </Table>,
    );

    expect(screen.getByText("No matching items")).toBeVisible();
    expect(screen.getByText("Adjust the filters or create the first item.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create item" })).toBeVisible();
    expect(container.querySelector('[data-slot="table-empty-state"]')).toHaveAttribute(
      "data-slot",
      "table-empty-state",
    );
    expect(container.querySelector("td")).toHaveAttribute("colspan", "5");
  });
});
