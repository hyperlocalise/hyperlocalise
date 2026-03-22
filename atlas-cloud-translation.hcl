// Atlas config for the cloud translation service schema.
data "external_schema" "bun" {
  program = [
    "go",
    "run",
    "-mod=mod",
    "ariga.io/atlas-provider-bun",
    "load",
    "--path", "./internal/translation/store",
    "--dialect", "postgres",
  ]
}

env "translation" {
  src = data.external_schema.bun.url
  dev = "docker://postgres/16/dev?search_path=public"
  migration {
    dir = "file://migrations/translation"
  }
  format {
    migrate {
      diff = "{{ sql . \"  \" }}"
    }
  }
}
