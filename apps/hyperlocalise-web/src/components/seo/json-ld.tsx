import type { WithContext } from "schema-dts";

export function JsonLd({
  data,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: WithContext<any>;
}) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e"),
      }}
    />
  );
}
