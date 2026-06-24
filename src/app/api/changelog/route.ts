import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import path from "path";

export interface ChangelogEntry {
  date: string;
  slug: string;
  title: string;
  content: string;
}

export async function GET() {
  const dir = path.join(process.cwd(), "src/content/changelog");

  let filenames: string[];
  try {
    filenames = (await readdir(dir))
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse(); // newest first
  } catch {
    return NextResponse.json({ entries: [] });
  }

  const entries: ChangelogEntry[] = await Promise.all(
    filenames.map(async (filename) => {
      const raw = await readFile(path.join(dir, filename), "utf-8");
      const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
      const date = dateMatch ? dateMatch[1] : "";
      const titleMatch = raw.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : filename.replace(/\.md$/, "");
      return { date, slug: filename.replace(/\.md$/, ""), title, content: raw };
    })
  );

  return NextResponse.json({ entries });
}
