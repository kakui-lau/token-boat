import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ApiClientError } from "@token-boat/api-client";
import { SessionBoundary } from "../session-boundary";

const { navigate, retry, sessionState } = vi.hoisted(() => ({
  navigate: vi.fn(),
  retry: vi.fn(),
  sessionState: {
    value: {
      error: null as Error | null,
      loading: false,
      retrying: false,
      session: null as { user: { id: number } } | null,
    },
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useRouterState: () => "/console/logs?field=request&q=req-1",
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../session-context", () => ({
  useSession: () => ({ ...sessionState.value, retry }),
}));

beforeEach(() => {
  navigate.mockReset();
  retry.mockReset();
  retry.mockResolvedValue(undefined);
  sessionState.value = { error: null, loading: false, retrying: false, session: null };
});

describe("SessionBoundary", () => {
  test("keeps the user on the console and offers retry when bootstrap fails", () => {
    sessionState.value = {
      error: new ApiClientError("API unavailable", 503, "SERVICE_UNAVAILABLE", "req-session-503"),
      loading: false,
      retrying: false,
      session: null,
    };

    render(
      <SessionBoundary>
        <div>Protected content</div>
      </SessionBoundary>,
    );

    expect(screen.getByText("Unable to restore your session")).toBeInTheDocument();
    expect(screen.getByText("503")).toBeInTheDocument();
    expect(screen.getByText("req-session-503")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  test("redirects to sign in after an authenticated session is rejected", async () => {
    render(
      <SessionBoundary>
        <div>Protected content</div>
      </SessionBoundary>,
    );

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: "/sign-in",
        replace: true,
        search: { redirect: "/console/logs?field=request&q=req-1" },
      }),
    );
  });

  test("renders protected content when a session is available", () => {
    sessionState.value = {
      error: null,
      loading: false,
      retrying: false,
      session: { user: { id: 1 } },
    };

    render(
      <SessionBoundary>
        <div>Protected content</div>
      </SessionBoundary>,
    );

    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });
});
