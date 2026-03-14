export function renderApp(): string {
  return `
    <main class="shell">
      <section class="hero">
        <p class="eyebrow">Hyperlocalise TMS</p>
        <h1>Gateway-first translation operations.</h1>
        <p class="lede">
          Run project, job, memory, glossary, and workflow operations through a
          public API while internal services stay transport-isolated.
        </p>
      </section>
      <section class="grid">
        <article>
          <h2>Public API</h2>
          <p>OpenAPI contracts for integrations and CLI remote workflows.</p>
        </article>
        <article>
          <h2>Internal Services</h2>
          <p>Dedicated service boundaries for jobs, memory, projects, and workflows.</p>
        </article>
        <article>
          <h2>CLI Compatibility</h2>
          <p>Existing local-file workflows stay in the Go CLI while TMS flows expand.</p>
        </article>
      </section>
    </main>
  `;
}
