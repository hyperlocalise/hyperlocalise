data "external_schema" "bun" {
  program = [
    "go",
    "run",
    "-mod=mod",
    "ariga.io/atlas-provider-bun",
    "load",
    "--path", "./apps/cli/internal/i18n/cache",
    "--dialect", "sqlite",
  ]
}

env "bun" {
  src = data.external_schema.bun.url
  dev = "sqlite://file::memory:?cache=shared"
  migration {
    dir = "file://migrations"
  }
  format {
    migrate {
      diff = "{{ sql . \"  \" }}"
    }
  }
}
