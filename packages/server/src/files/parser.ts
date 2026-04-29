import fs from "fs";
import path from "path";

export async function parseFile(filePath: string, mimeType: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf" || mimeType === "application/pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (ext === ".docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  if ([".txt", ".md", ".csv", ".json"].includes(ext)) {
    return fs.readFileSync(filePath, "utf-8");
  }

  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) {
    return `[Image file: ${path.basename(filePath)}. Content not extractable as text — the image has been stored and can be referenced.]`;
  }

  return `[File: ${path.basename(filePath)}. Type not supported for text extraction.]`;
}
