function canonicalArguments(value: unknown, seen = new WeakSet<object>()): unknown {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) throw new Error("Circular arguments");
  seen.add(value);
  const result = Array.isArray(value)
    ? value.map((item) => canonicalArguments(item, seen))
    : Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonicalArguments(item, seen)]),
      );
  seen.delete(value);
  return result;
}

export function applyFunctionResult(
  failures: Map<string, string>,
  name: string,
  args: unknown,
  result: unknown,
): void {
  let keyArgs: string;
  try {
    keyArgs = JSON.stringify(canonicalArguments(args)) ?? "null";
  } catch {
    keyArgs = "[unserializable]";
  }
  const key = `${name}:${keyArgs}`;
  if (result && typeof result === "object" && "success" in result) {
    const record = result as { success?: unknown; message?: unknown };
    if (record.success === false) {
      failures.set(
        key,
        typeof record.message === "string" ? record.message : "操作に失敗しました。",
      );
    } else if (record.success === true) {
      failures.delete(key);
    }
  }
}

export function failureSummary(failures: Map<string, string>): string | null {
  if (!failures.size) return null;
  return [...failures.values()].join(" / ");
}

export function parseFunctionResult(raw: string): object {
  try {
    const result: unknown = JSON.parse(raw);
    return result && typeof result === "object" && !Array.isArray(result) ? result : { result };
  } catch {
    return { result: raw };
  }
}
