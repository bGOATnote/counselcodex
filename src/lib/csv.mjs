import { readFile, writeFile } from "node:fs/promises";

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const [headers, ...body] = rows;
  return body.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function escapeField(value) {
  const raw = String(value ?? "");
  const text = /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function stringifyCsv(rows, headers = rows.length ? Object.keys(rows[0]) : []) {
  return `${[headers, ...rows.map((row) => headers.map((header) => row[header]))].map((row) => row.map(escapeField).join(",")).join("\n")}\n`;
}

export async function readCsv(path) {
  return parseCsv(await readFile(path, "utf8"));
}

export async function writeCsv(path, rows, headers) {
  await writeFile(path, stringifyCsv(rows, headers), "utf8");
}
