export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (field || row.length) rows.push([...row, field.replace(/\r$/, "")]);
  const [headers, ...body] = rows;
  if (!headers?.length || new Set(headers).size !== headers.length) throw new Error("Invalid CSV header");
  return body.filter((cells) => cells.some(Boolean)).map((cells) => {
    if (cells.length !== headers.length) throw new Error("CSV column count mismatch");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  });
}
