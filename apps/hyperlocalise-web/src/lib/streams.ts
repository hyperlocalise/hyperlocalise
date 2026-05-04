export function bufferFromStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();

    function read() {
      reader
        .read()
        .then(({ done, value }) => {
          if (done) {
            resolve(Buffer.concat(chunks.map((c) => Buffer.from(c))));
            return;
          }
          if (value) {
            chunks.push(value);
          }
          read();
        })
        .catch(reject);
    }

    read();
  });
}
