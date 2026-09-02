import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { KeyRoundIcon } from "lucide-react";
import { describe, expect, test } from "vitest";

import { TooltipProvider } from "@token-boat/ui/components/ui/tooltip";
import { SecurityMethodCardHeader } from "../components/security-method-card-header";

describe("SecurityMethodCardHeader", () => {
  test("keeps guidance hidden until the information control receives focus", async () => {
    const description = "How this sign-in method protects the account.";

    render(
      <TooltipProvider>
        <SecurityMethodCardHeader description={description} icon={KeyRoundIcon} title="Password" />
      </TooltipProvider>,
    );

    expect(screen.queryByText(description)).not.toBeInTheDocument();

    fireEvent.focus(screen.getByRole("button", { name: description }));

    await waitFor(() => expect(screen.getByText(description)).toBeVisible());
  });
});
