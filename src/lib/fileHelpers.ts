function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readFileByReader(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("FileReader 读取失败"));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
  });
}

async function readFileByResponse(file: Blob): Promise<string> {
  const res = new Response(file);
  return await res.text();
}

export function readFileAsText(file: File): Promise<string> {
  if (file.size === 0) {
    return Promise.reject(new Error("文件为空"));
  }

  const methods: Array<() => Promise<string>> = [];

  if (typeof file.text === "function") {
    methods.push(() => file.text());
  }
  methods.push(() => readFileByResponse(file));
  if (typeof file.arrayBuffer === "function") {
    methods.push(async () => new TextDecoder().decode(await file.arrayBuffer()));
  }
  methods.push(() => readFileByReader(file));

  return (async () => {
    const errors: string[] = [];

    for (const method of methods) {
      for (let i = 0; i < 3; i += 1) {
        try {
          return await method();
        } catch (error) {
          const message = String((error as Error).message || error);
          errors.push(message);
          const needRetry = /not readable|could not be read|permission/i.test(message);
          if (!needRetry || i === 2) break;
          await wait(120 * (i + 1));
        }
      }
    }

    const uniqueErrors = Array.from(new Set(errors.filter(Boolean)));
    throw new Error(uniqueErrors.join(" | ") || "未知文件读取错误");
  })();
}

export function parseJSONLoose(text: string) {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  return JSON.parse(cleaned) as unknown;
}
