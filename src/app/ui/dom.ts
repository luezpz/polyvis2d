/** Tiny DOM helpers — just enough to build the panel without a framework. */

type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
type Child = Node | string | null | undefined | false;

/**
 * Creates an element. Attributes starting with `on` are attached as event
 * listeners (`onclick` → "click"); boolean `true` sets an empty attribute.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key === "class") el.className = String(value);
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** Triggers a browser download of a text file. */
export function downloadText(filename: string, text: string, mime = "application/json"): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens a file picker and resolves with the chosen file's text (or null if cancelled). */
export function pickTextFile(accept = ".json,application/json"): Promise<string | null> {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept });
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      resolve(file ? await file.text() : null);
    });
    input.click();
  });
}
