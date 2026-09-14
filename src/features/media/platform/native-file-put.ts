import { requireNativeModule } from "expo";
import { randomUUID } from "expo-crypto";

type FilePutModule = Readonly<{
  putAsync: (
    id: string,
    url: string,
    uri: string,
    contentType: string,
    byteSize: number,
  ) => Promise<Readonly<{ status: number }>>;
  cancelAsync: (id: string) => Promise<void>;
}>;

/** Only metadata crosses JSI. Native code owns the file-backed PUT and an isolated
 * HTTP client, never the API session. Both native methods use one ordered queue,
 * so even immediate cancellation reaches the registered request. */
export async function putNativeFile(
  input: Readonly<{
    url: string;
    uri: string;
    contentType: string;
    byteSize: number;
    signal: AbortSignal;
  }>,
) {
  if (input.signal.aborted) throw new Error("cancelled");
  const native = requireNativeModule<FilePutModule>("JamyeFilePut");
  const id = randomUUID();
  const pending = native.putAsync(
    id,
    input.url,
    input.uri,
    input.contentType,
    input.byteSize,
  );
  const cancel = () => {
    void native.cancelAsync(id).catch(() => undefined);
  };
  input.signal.addEventListener("abort", cancel, { once: true });
  if (input.signal.aborted) cancel();
  try {
    return await pending;
  } finally {
    input.signal.removeEventListener("abort", cancel);
  }
}
