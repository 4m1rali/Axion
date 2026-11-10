export interface SftpFileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified?: number | null;
}
