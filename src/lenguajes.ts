// Responsabilidad: deducir el lenguaje de una guía (para el resaltado del visor) a partir de la extensión del archivo.
import * as path from 'path';

const POR_EXTENSION: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.cs': 'csharp', '.java': 'java', '.kt': 'kotlin', '.go': 'go', '.rs': 'rust', '.rb': 'ruby', '.php': 'php',
  '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.hpp': 'cpp', '.swift': 'swift', '.sql': 'sql', '.json': 'json', '.html': 'xml', '.xml': 'xml',
  '.css': 'css', '.scss': 'scss', '.md': 'markdown', '.yml': 'yaml', '.yaml': 'yaml', '.sh': 'bash', '.ps1': 'powershell', '.lua': 'lua',
};

/** `idDelEditor` (el lenguaje que VS Code detectó) manda; si es texto plano o falta, se usa la extensión. */
export function lenguajeDe(ruta: string, idDelEditor?: string): string {
  if (idDelEditor && idDelEditor !== 'plaintext') return idDelEditor;
  return POR_EXTENSION[path.extname(ruta).toLowerCase()] ?? '';
}
