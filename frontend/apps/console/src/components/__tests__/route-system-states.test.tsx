import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ApiClientError } from "@token-boat/api-client";
import { RouteErrorBoundary } from "../route-error-boundary";
import { RouteNotFound } from "../route-not-found";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    search,
    to,
    ...props
  }: React.ComponentProps<"a"> & { search?: { redirect?: string }; to: string }) => {
    const href = search?.redirect ? `${to}?redirect=${encodeURIComponent(search.redirect)}` : to;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
  useRouterState: ({ select }: { select(state: { location: { href: string } }): string }) =>
    select({ location: { href: "/console/models?family=chat" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("route system states", () => {
  test("shows the real status and support reference for service failures", () => {
    const reset = vi.fn();

    render(
      <RouteErrorBoundary
        error={new ApiClientError("Unavailable", 503, "SERVICE_UNAVAILABLE", "req-route-503")}
        reset={reset}
      />,
    );

    expect(screen.getByText("Service temporarily unavailable")).toBeInTheDocument();
    expect(screen.getByText("503")).toBeInTheDocument();
    expect(screen.getByText("req-route-503")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  test("routes an expired session to sign in without offering a misleading retry", () => {
    render(
      <RouteErrorBoundary
        error={new ApiClientError("Unauthorized", 401, "AUTH_UNAUTHORIZED", "req-auth-401")}
        reset={vi.fn()}
      />,
    );

    expect(screen.getByText("Session expired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to sign in" })).toHaveAttribute(
      "href",
      "/sign-in?redirect=%2Fconsole%2Fmodels%3Ffamily%3Dchat",
    );
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  test("reloads the current address when a deployed page module can no longer be loaded", () => {
    const onReload = vi.fn();
    const reset = vi.fn();

    render(
      <RouteErrorBoundary
        error={new TypeError("Failed to fetch dynamically imported module")}
        onReload={onReload}
        reset={reset}
      />,
    );

    expect(screen.getByText("A page update is required")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload page" }));
    expect(onReload).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
  });

  test("provides a dedicated 404 state for unknown console routes", () => {
    render(<RouteNotFound />);

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText("Page not found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to overview" })).toHaveAttribute("href", "/");
  });
});
