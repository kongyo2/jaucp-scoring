/**
 * ブラウザバンドル用の最小 path シム。
 * kuromoji の BrowserDictionaryLoader が `path.join` で辞書URLを組み立てるため、
 * vite の resolve.alias で node:path の代わりにこのモジュールを与える。
 */
export function join(...parts: string[]): string {
    return parts
        .filter((part) => part.length > 0)
        .join("/")
        .replace(/\/{2,}/g, "/");
}

export default { join };
