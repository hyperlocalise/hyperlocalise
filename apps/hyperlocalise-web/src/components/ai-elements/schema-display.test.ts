import { describe, expect, it } from "vite-plus/test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SchemaDisplay, SchemaDisplayPath } from "./schema-display";

describe("SchemaDisplayPath", () => {
  it("highlights path parameters with HTML tags", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        SchemaDisplay,
        { method: "GET", path: "/api/v1/users/{id}" },
        React.createElement(SchemaDisplayPath, {}),
      ),
    );
    expect(markup).toContain('<span class="text-blue-600 dark:text-blue-400">{id}</span>');
  });

  it("is no longer vulnerable to XSS in path", () => {
    // Malicious path input
    const maliciousPath = "/api/v1/<img src=x onerror=alert(1)>";
    const markup = renderToStaticMarkup(
      React.createElement(
        SchemaDisplay,
        { method: "GET", path: maliciousPath },
        React.createElement(SchemaDisplayPath, {}),
      ),
    );

    // Malicious HTML should be escaped
    expect(markup).not.toContain("<img src=x onerror=alert(1)>");
    expect(markup).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("is no longer vulnerable to XSS in children", () => {
    const maliciousChild = "<img src=y onerror=alert(2)>";
    const markup = renderToStaticMarkup(
      React.createElement(
        SchemaDisplay,
        { method: "GET", path: "/api/v1/users" },
        React.createElement(SchemaDisplayPath, { children: maliciousChild } as any),
      ),
    );

    expect(markup).not.toContain("<img src=y onerror=alert(2)>");
    expect(markup).toContain("&lt;img src=y onerror=alert(2)&gt;");
  });

  it("correctly highlights multiple parameters", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        SchemaDisplay,
        { method: "GET", path: "/org/{orgId}/project/{projectId}" },
        React.createElement(SchemaDisplayPath, {}),
      ),
    );
    expect(markup).toContain('<span class="text-blue-600 dark:text-blue-400">{orgId}</span>');
    expect(markup).toContain('<span class="text-blue-600 dark:text-blue-400">{projectId}</span>');
    expect(markup).toContain("/org/");
    expect(markup).toContain("/project/");
  });
});
