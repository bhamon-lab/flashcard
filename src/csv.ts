import Papa from 'papaparse';

export type NormalizedImportRow = {
  firstName: string;
  lastName: string;
  context: string;
  photo: string;
  externalId: string;
  line: number;
};

const normalizeHeader = (value: string) => value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function parseImportRows(csvText: string): { rows: NormalizedImportRow[]; errors: string[] } {
  const rawLines = csvText.split(/\r?\n/).filter((line) => line.trim());
  if (rawLines[0]?.includes('<img')) {
    const rows = rawLines.map((line, index) => {
      const columns = line.split(';').map((value) => value.trim());
      const nameParts = (columns[1] ?? '').split(/\s+\.\s+/);
      const firstName = (nameParts.shift() ?? '').replace(/^['"]|['"]$/g, '').trim();
      const lastName = nameParts.join(' . ').replace(/^['"]|['"]$/g, '').trim();
      const photo = columns.slice(2).join(';').match(/src\s*=\s*["']([^"']+)["']/i)?.[1] ?? '';
      return {
        firstName,
        lastName,
        context: columns[0] ?? '',
        photo,
        externalId: `${columns[0] ?? ''}:${photo || `${firstName}-${lastName}`}`,
        line: index + 1,
      };
    });
    return { rows, errors: [] };
  }

  const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: 'greedy' });
  const data = parsed.data;
  if (!data.length) return { rows: [], errors: ['Le fichier est vide.'] };
  const header = data[0].map(normalizeHeader);
  const firstNameIndex = header.findIndex((value) => ['prenom', 'firstname', 'first_name'].includes(value));
  const hasHeader = firstNameIndex >= 0;
  const indexOf = (aliases: string[]) => header.findIndex((value) => aliases.includes(value));
  const lastNameIndex = indexOf(['nom', 'lastname', 'last_name']);
  const contextIndex = indexOf(['contexte', 'context', 'role']);
  const photoIndex = indexOf(['photo', 'photo_url', 'image', 'image_url']);
  const externalIdIndex = indexOf(['id_externe', 'external_id', 'id']);
  const rows: NormalizedImportRow[] = [];

  for (let index = hasHeader ? 1 : 0; index < data.length; index += 1) {
    const columns = data[index].map((value) => String(value ?? '').trim());
    if (hasHeader) {
      rows.push({
        firstName: columns[firstNameIndex] ?? '',
        lastName: lastNameIndex >= 0 ? columns[lastNameIndex] ?? '' : '',
        context: contextIndex >= 0 ? columns[contextIndex] ?? '' : '',
        photo: photoIndex >= 0 ? columns[photoIndex] ?? '' : '',
        externalId: externalIdIndex >= 0 ? columns[externalIdIndex] ?? '' : '',
        line: index + 1,
      });
      continue;
    }
    rows.push({ firstName: columns[0] ?? '', lastName: columns[1] ?? '', context: columns[3] ?? '', photo: columns[2] ?? '', externalId: '', line: index + 1 });
  }

  return {
    rows,
    errors: parsed.errors.slice(0, 5).map((error) => `Ligne ${(error.row ?? 0) + 1} : ${error.message}`),
  };
}
