import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@token-boat/ui/components/ui/sidebar";
import { TooltipProvider } from "@token-boat/ui/components/ui/tooltip";

describe("collapsed sidebar", () => {
  test("keeps every compact navigation target clickable and the item list vertically scrollable", () => {
    const onSelect = vi.fn();

    const { container } = render(
      <TooltipProvider>
        <SidebarProvider defaultOpen={false}>
          <Sidebar collapsible="icon">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Primary navigation</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {Array.from({ length: 18 }, (_, index) => (
                      <SidebarMenuItem key={index}>
                        <SidebarMenuButton
                          aria-label={`Navigation ${index + 1}`}
                          onClick={() => onSelect(index + 1)}
                          tooltip={`Navigation ${index + 1}`}
                        >
                          <span aria-hidden="true">{index + 1}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
        </SidebarProvider>
      </TooltipProvider>,
    );

    const content = container.querySelector('[data-sidebar="content"]');
    expect(content).toHaveClass("overflow-auto", "group-data-[collapsible=icon]:overflow-x-hidden");

    const groupLabel = container.querySelector('[data-sidebar="group-label"]');
    expect(groupLabel).toHaveClass("group-data-[collapsible=icon]:pointer-events-none");

    const first = screen.getByRole("button", { name: "Navigation 1" });
    const middle = screen.getByRole("button", { name: "Navigation 9" });
    const last = screen.getByRole("button", { name: "Navigation 18" });

    expect(first).toHaveClass(
      "group-data-[collapsible=icon]:size-10!",
      "group-data-[collapsible=icon]:p-3!",
    );
    fireEvent.click(first);
    fireEvent.click(middle);
    fireEvent.click(last);

    expect(onSelect).toHaveBeenNthCalledWith(1, 1);
    expect(onSelect).toHaveBeenNthCalledWith(2, 9);
    expect(onSelect).toHaveBeenNthCalledWith(3, 18);
  });
});
