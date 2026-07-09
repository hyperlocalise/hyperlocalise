// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { TmsLiveProjectPicker } from "./tms-live-project-picker";

const useTmsLiveProjectsMock = vi.fn();

vi.mock("../_hooks/use-tms-live-projects", () => ({
  useTmsLiveProjects: (...args: unknown[]) => useTmsLiveProjectsMock(...args),
}));

describe("TmsLiveProjectPicker", () => {
  beforeEach(() => {
    useTmsLiveProjectsMock.mockReset();
  });

  it("shows the project name in the trigger instead of the raw external id", () => {
    useTmsLiveProjectsMock.mockReturnValue({
      data: [
        {
          id: "provider:crowdin:902807",
          name: "Marketing website",
          externalProjectId: "902807",
          isActive: true,
        },
      ],
      isLoading: false,
    });

    render(
      <TmsLiveProjectPicker
        organizationSlug="acme"
        value="902807"
        onValueChange={() => undefined}
      />,
    );

    expect(screen.getByText("Marketing website")).toBeInTheDocument();
    expect(screen.queryByText("902807")).not.toBeInTheDocument();
  });
});
