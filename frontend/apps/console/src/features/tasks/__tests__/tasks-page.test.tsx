import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { TaskListInput, TaskRecord, TaskType } from "@/data/contracts";
import { TasksPage } from "../pages/tasks-page";

const { getTasksPage, getTaskTypeCounts } = vi.hoisted(() => ({
  getTasksPage: vi.fn(),
  getTaskTypeCounts: vi.fn(),
}));

vi.mock("@/data/repository", () => ({
  repository: { getTasksPage, getTaskTypeCounts },
}));

vi.mock("@/components/date-range-picker", () => ({
  DateRangePicker: () => <button type="button">Date range</button>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, values?: Record<string, string | number>) => {
      if (!values) return key;
      return Object.entries(values).reduce(
        (label, [name, value]) => label.replace(`{{${name}}}`, String(value)),
        key,
      );
    },
  }),
}));

beforeEach(() => {
  getTasksPage.mockReset();
  getTaskTypeCounts.mockReset();
});

describe("TasksPage", () => {
  test("warns users to download generated results before they expire", async () => {
    configureTaskRepository([]);

    renderTasksPage();

    expect(await screen.findByText("Download generated results promptly")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Generated image, video, and audio files may expire or become unavailable. Download and store them immediately after the task succeeds.",
      ),
    ).toBeInTheDocument();
  });

  test("separates task types and renders the desktop collection in four columns", async () => {
    configureTaskRepository([
      taskFixture("image-1", "image", "Image prompt"),
      taskFixture("image-2", "image", "Second image prompt"),
      taskFixture("video-1", "video", "Video prompt"),
      taskFixture("audio-1", "audio", "Audio prompt"),
    ]);

    renderTasksPage();

    expect(await screen.findByRole("tab", { name: /All tasks 4/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /Image tasks 2/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Video tasks 1/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Audio tasks 1/ })).toBeInTheDocument();

    const card = screen.getByText("Image prompt").closest('[data-slot="card"]');
    expect(card?.parentElement).toHaveClass("xl:grid-cols-4");

    fireEvent.click(screen.getByRole("tab", { name: /Video tasks 1/ }));
    expect(await screen.findByText("Video prompt")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Image prompt")).not.toBeInTheDocument());
    expect(screen.queryByText("Audio prompt")).not.toBeInTheDocument();
  });

  test("paginates dense task collections in multiples of four", async () => {
    configureTaskRepository(
      Array.from({ length: 13 }, (_, index) =>
        taskFixture(`image-${index + 1}`, "image", `Image prompt ${index + 1}`, index),
      ),
    );

    renderTasksPage();

    expect(await screen.findByText("Image prompt 1")).toBeInTheDocument();
    expect(screen.queryByText("Image prompt 13")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1–12 of 13 results")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    expect(await screen.findByText("Image prompt 13")).toBeInTheDocument();
    expect(screen.getByText("Showing 13–13 of 13 results")).toBeInTheDocument();
  });

  test("shows complete type-specific and failure information in task details", async () => {
    const failedTask = taskFixture("image-failed", "image", "Failed image prompt");
    failedTask.status = "failed";
    failedTask.progress = 42;
    failedTask.failureReason = "Unsupported aspect ratio";
    failedTask.metadata.resolution = "1536×1024";
    failedTask.resultUrl = "https://cdn.example.com/image-failed.png";
    configureTaskRepository([failedTask]);

    renderTasksPage();

    fireEvent.click(await screen.findByRole("button", { name: "View details" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("tabindex", "-1");
    expect(dialog).toHaveTextContent("Type-specific details");
    expect(dialog).toHaveTextContent("1536×1024");
    expect(dialog).not.toHaveTextContent("image-platform");
    expect(dialog).toHaveTextContent("Billing unit");
    expect(dialog).toHaveTextContent("https://cdn.example.com/image-failed.png");
    expect(dialog).toHaveTextContent("Unsupported aspect ratio");
    expect(screen.getByRole("img", { name: "Failed image prompt" })).toHaveAttribute(
      "src",
      "https://cdn.example.com/image-failed.png",
    );
  });

  test("shows task charges with four decimal places in cards and details", async () => {
    const task = taskFixture("image-cost", "image", "Precisely billed image");
    task.cost = 0.049572;
    configureTaskRepository([task]);

    renderTasksPage();

    expect(await screen.findByText("$0.0496")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("$0.0496");
  });

  test("restores a shared task detail and clears the URL selection when closed", async () => {
    configureTaskRepository([taskFixture("video-shared", "video", "Shared video task")]);
    const onSearchChange = vi.fn();

    renderTasksPage(
      <TasksPage search={{ detail: "video-shared" }} onSearchChange={onSearchChange} />,
    );

    expect(await screen.findByRole("dialog")).toHaveTextContent("video-shared");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onSearchChange).toHaveBeenCalledWith({ detail: undefined });
  });

  test("does not substitute another task when a shared task is unavailable", async () => {
    configureTaskRepository([taskFixture("image-current", "image", "Current image task")]);
    const onSearchChange = vi.fn();

    renderTasksPage(
      <TasksPage search={{ detail: "task-missing" }} onSearchChange={onSearchChange} />,
    );

    expect(await screen.findByText("Task details unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onSearchChange).toHaveBeenCalledWith({ detail: undefined });
  });

  test("does not present zero type counts while the count query is loading", async () => {
    const task = taskFixture("audio-loading", "audio", "Audio task while counts load");
    getTasksPage.mockResolvedValue({ items: [task], page: 1, pageSize: 12, total: 1 });
    let resolveCounts!: (value: {
      all: number;
      image: number;
      video: number;
      audio: number;
    }) => void;
    getTaskTypeCounts.mockReturnValue(
      new Promise((resolve) => {
        resolveCounts = resolve;
      }),
    );

    renderTasksPage();

    expect(await screen.findByText("Audio task while counts load")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /All tasks 0/ })).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Loading")).toHaveLength(4);

    resolveCounts({ all: 1, image: 0, video: 0, audio: 1 });
    expect(await screen.findByRole("tab", { name: /All tasks 1/ })).toBeInTheDocument();
  });

  test("distinguishes a failed task request from an empty collection", async () => {
    getTasksPage.mockRejectedValue(new Error("offline"));
    getTaskTypeCounts.mockRejectedValue(new Error("offline"));

    renderTasksPage();

    expect(await screen.findByText("Unable to load tasks")).toBeInTheDocument();
    expect(screen.queryByText("No matching tasks")).not.toBeInTheDocument();
  });

  test("keeps tasks usable when only type totals fail", async () => {
    const task = taskFixture("image-count-error", "image", "Task remains available");
    getTasksPage.mockResolvedValue({ items: [task], page: 1, pageSize: 12, total: 1 });
    getTaskTypeCounts.mockRejectedValue(new Error("count endpoint offline"));

    renderTasksPage();

    expect(await screen.findByText("Task remains available")).toBeInTheDocument();
    expect(screen.getByText("Task type counts unavailable")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "All tasks —" })).toBeInTheDocument();
    expect(screen.queryByText("Unable to load tasks")).not.toBeInTheDocument();
  });
});

function renderTasksPage(page: ReactNode = <TasksPage />) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{page}</QueryClientProvider>);
}

function configureTaskRepository(records: TaskRecord[]) {
  getTaskTypeCounts.mockResolvedValue({
    all: records.length,
    image: records.filter((item) => item.type === "image").length,
    video: records.filter((item) => item.type === "video").length,
    audio: records.filter((item) => item.type === "audio").length,
  });
  getTasksPage.mockImplementation(async (input: TaskListInput) => {
    const filtered =
      input.type === "all" ? records : records.filter((item) => item.type === input.type);
    const start = (input.page - 1) * input.pageSize;
    return {
      items: filtered.slice(start, start + input.pageSize),
      page: input.page,
      pageSize: input.pageSize,
      total: filtered.length,
    };
  });
}

function taskFixture(id: string, type: TaskType, prompt: string, ageSeconds = 0): TaskRecord {
  const now = Math.floor(Date.now() / 1000) - ageSeconds;
  return {
    id,
    type,
    model: `${type}-model`,
    prompt,
    platform: `${type}-platform`,
    action: `${type}.generate`,
    status: "succeeded",
    progress: 100,
    createdAt: now,
    startedAt: now,
    updatedAt: now + 2,
    completedAt: now + 2,
    failureReason: null,
    resultUrl: null,
    cost: 0.1,
    costUnit: "usd",
    metadata: {
      durationSeconds: type === "video" || type === "audio" ? 8 : null,
      resolution: type === "image" || type === "video" ? "1024×1024" : null,
      aspectRatio: type === "image" || type === "video" ? "1:1" : null,
      outputCount: 1,
      quality: "standard",
      voice: type === "audio" ? "alloy" : null,
      format: type === "audio" ? "mp3" : "png",
    },
  };
}
