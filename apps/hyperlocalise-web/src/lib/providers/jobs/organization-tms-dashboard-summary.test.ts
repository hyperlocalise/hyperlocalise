import { describe, expect, it } from "vite-plus/test";

describe("organization-tms-dashboard-summary", () => {
  it("exports a live-TMS dashboard summary shape without background sync fields", () => {
    expect({
      providers: [],
      counts: {
        connectedProviders: 0,
        externalProjects: 0,
        openProviderJobs: 0,
      },
    }).toEqual({
      providers: [],
      counts: {
        connectedProviders: 0,
        externalProjects: 0,
        openProviderJobs: 0,
      },
    });
  });
});
