export interface TransformResult {
  source: string;
  count: number;
}

export interface TransformModule {
  name: string;
  rulePath: string;
  apply(source: string): TransformResult;
}

export function applyReplacements(
  source: string,
  replacements: Array<[RegExp, string | ((...args: string[]) => string)]>,
): TransformResult {
  let count = 0;
  let next = source;

  for (const [pattern, replacement] of replacements) {
    next = next.replace(pattern, (...args: unknown[]) => {
      count += 1;
      if (typeof replacement === "function") {
        return replacement(...(args as string[]));
      }
      return replacement.replace(/\$(\d+)/g, (_token, index: string) => {
        const value = args[Number(index)];
        return typeof value === "string" ? value : "";
      });
    });
  }

  return { source: next, count };
}
