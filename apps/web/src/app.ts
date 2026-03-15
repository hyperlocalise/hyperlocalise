export function renderApp(): string {
  return `
    <main class="shell">
      <section class="hero">
        <p class="eyebrow">Hyperlocalise</p>
        <h1>Localization workflows, without the placeholder shell.</h1>
        <p class="lede">
          The repository now centers on the CLI and shared localization
          infrastructure that is actually implemented.
        </p>
      </section>
      <section class="grid">
        <article>
          <h2>CLI First</h2>
          <p>Run generation, evaluation, and sync workflows from the Go CLI.</p>
        </article>
        <article>
          <h2>Shared Internals</h2>
          <p>Reuse parser, storage, translation, and runtime support packages.</p>
        </article>
        <article>
          <h2>Focused Surface</h2>
          <p>Removed unused service and gateway scaffolding from the workspace.</p>
        </article>
      </section>
    </main>
  `;
}
