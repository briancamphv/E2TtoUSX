import fs, { createWriteStream, readFile } from "fs";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import path from "path";
import AdmZip from "adm-zip";

//validate with https://github.com/ubsicap/usx/blob/master/schema/usx.rng

const argv = yargs(hideBin(process.argv))
  .version("1.0.1")
  .usage("$0 <docxPath> [--templates template.json]")
  .demandCommand(1)
  .options({
    templates: { type: "string", describe: "Template JSON" },
  })
  .help().argv;

const templates = String(argv.templates).split(",");

const writeStream = createWriteStream(argv._[0], { flags: "w" });

var unzipDir = "";

templates.map((template) => {
  const files = getFilePaths(template);

  files.map(async (template) => {
    if (String(template).endsWith("zip")) {
      setTimeout(() => {
        extractTemplateJson(template).then((template) => {
          reportOnTemplateData(template);
        });
      }, 500);
    }
  });
});

function getFilePaths(targetPath, recursive = false) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Path not found: ${targetPath}`);
  }

  const stat = fs.statSync(targetPath);

  if (stat.isFile()) {
    return [path.resolve(targetPath)];
  }

  if (stat.isDirectory()) {
    const files = [];

    const readDir = (dir) => {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const itemStat = fs.statSync(fullPath);

        if (itemStat.isFile()) {
          files.push(path.resolve(fullPath));
        } else if (recursive && itemStat.isDirectory()) {
          readDir(fullPath);
        }
      }
    };

    readDir(targetPath);
    return files;
  }

  throw new Error(`Unsupported path type: ${targetPath}`);
}

function checkFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  return true;
}

async function extractTemplateJson(zipFilePath, outputDir) {
  try {
    // Default output directory: same as the zip file
    unzipDir =
      outputDir ||
      path.join(path.dirname(zipFilePath), "unzipped_" + Date.now());

    // Ensure output directory exists
    fs.mkdirSync(unzipDir, { recursive: true });

    // Extract
    const zip = new AdmZip(zipFilePath);

    zip.extractAllTo(unzipDir, true);

    // Look for template.json
    let foundPath = null;

    const findTemplateJson = (dir) => {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const result = findTemplateJson(fullPath);
          if (result) return result;
        } else if (item.toLowerCase() === "template.json") {
          return fullPath;
        }
      }
      return null;
    };

    foundPath = findTemplateJson(unzipDir);

    if (!foundPath) {
      throw new Error("template.json not found in the zip file.");
    }

    return foundPath;
  } catch (err) {
    console.error("Error unzipping file:", err);
    throw err;
  }
}

function hasConsecutiveDuplicateAnyPhrase(
  text,
  { caseInsensitive = true } = {},
) {
  if (typeof text !== "string") return false;

  const flags = caseInsensitive ? "i" : "";
  // Captures a minimal phrase then checks it repeats right after whitespace
  const re = new RegExp(String.raw`(?:^|\s)(.+?)(?:\s+)\1(?:\s|$)`, flags);
  return re.test(text);
}

function reportOnTemplateData(templateFile) {
  const baseDir = templateFile.replace(/template\.json$/i, "");

  return new Promise((resolve, reject) => {
    readFile(templateFile, "utf8", (err, data) => {
      if (err) {
        console.error("Error reading file:", err);
        return reject(err);
      }

      try {
        const jsonData = JSON.parse(data);
        const bookname = jsonData.textTitle.bookName;
        var prevChapter = 0;

        writeStream.write(`**${jsonData.textTitle.title}**\n`);

        console.log("jsonData.sections[0].parts[0].chapter", jsonData.sections[0].parts[0].chapter);
        if (jsonData.sections[0].parts[0].chapter === "1") {
          if (
            jsonData.bookInfo.summary == undefined ||
            jsonData.bookInfo.summary == null ||
            jsonData.bookInfo.summary.trim() === ""
          ) {
            const errorText = `${bookname} bookInfo summary is missing or empty\n`;
            writeStream.write(errorText);
          }
        }

        jsonData.sections.map((section) => {
          section.parts.map((part) => {
            const pictureExt = part.picture?.fileName.split(".").pop();
            const audioExt = part.audio?.fileName.split(".").pop();

            if (part.picture?.fileName == undefined) {
            } else if (
              !checkFileExists(
                path.join(baseDir, part.picture?.id + "." + pictureExt),
              )
            ) {
              const errorText = `${bookname} ${part.chapter}:${part.verse}: picture file not found: ${part.picture?.fileName}\n`;
              writeStream.write(errorText);
            }

            if (
              !checkFileExists(
                path.join(baseDir, part.audio?.id + "." + audioExt),
              )
            ) {
              const errorText = `${bookname} ${part.chapter}:${part.verse}: audio file not found: ${part.audio?.fileName}\n`;
              writeStream.write(errorText);
            }

            if (part.picture !== null && part.picture.errors) {
              const errorText = `${bookname} ${part.chapter}:${part.verse}: ${part.picture.errors[0]}\n`;
              writeStream.write(errorText);
            }

            if (part.audio !== null && part.audio.errors) {
              const errorText = `${bookname} ${jsonData.textTitle.bookName} ${part.chapter}:${part.verse}: ${part.audio.errors[0]}\n`;

              writeStream.write(errorText);
            }

            if (part.chapter !== null && part.chapter < prevChapter) {
              const errorText = `${bookname} ${jsonData.textTitle.bookName} ${part.chapter}:${part.verse}: is less than the previous pericope's chapter of: ${prevChapter}\n`;
              writeStream.write(errorText);
            }

            prevChapter = part.chapter;

            part.commentaries.map((commentary) => {
              const title = commentary.title;

              if (commentary.title == commentary.content) {
                const errorText = `${bookname} ${part.chapter}:${part.verse} highlighted text: ${title} is exact match of BEN Text Options\n`;

                if (
                  errorText.includes(
                    "highlighted text: Â  is exact match of BEN Text Options",
                  ) ||
                  errorText.includes(
                    "highlighted text:   is exact match of BEN Text Options",
                  ) ||
                  errorText.includes(
                    "highlighted text:  is exact match of BEN Text Options",
                  )
                ) {
                } else {
                  writeStream.write(errorText);
                }
              }

              // if (hasConsecutiveDuplicateAnyPhrase(commentary.content)) {
              //   const errorText = `${bookname} ${part.chapter}:${part.verse} highlighted text: ${title}, BEN Text Options has consecutive duplicate phrases in ${commentary.content}\n`;
              //   writeStream.write(errorText);
              // }

              const stripItalicTags = (str) => {
                var retStr = str.replace(/<\/?i>/gi, "");

                return retStr;
              };

              const normalize = (str = "") =>
                str
                  .replace(/<\/?i>/gi, "")
                  .replace(/[\r\n]+/g, " ")
                  .replace(/\u00A0/g, " ")
                  .replace(/[“”]/g, '"')
                  .replace(/[‘’]/g, "'")
                  .replace(/\s+/g, " ")
                  .trim();

              const escapeRegex = (str) =>
                str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

              const buildFlexibleRegex = (text) => {
                const cleanText = normalize(text);
                const tokens = cleanText.split(/\s+/).map(escapeRegex);

                return new RegExp(tokens.join(String.raw`\s+`), "i");
              };

              const regex = buildFlexibleRegex(title);
              if (!normalize(part.text).match(regex)) {
                const errorText = `${bookname} ${part.chapter}:${part.verse} highlighted text: ${title} is not included in the text\n`;
                if (
                  errorText.includes(
                    "highlighted text: <i></i> is not included in the text",
                  )
                ) {
                } else {
                  writeStream.write(errorText);
                }
              }

              commentary.resources.map((resource) => {
                if (resource.errors) {
                  const errorText = `${bookname} ${part.chapter}:${part.verse} commentary: ${title} ${resource.errors[0]}\n`;
                  writeStream.write(errorText);
                }
              });
            });
          });
        });

        jsonData.passageOverview.notes.map((note) => {
          note.resources.map((resource) => {
            if (resource.errors && resource.errors !== undefined) {
              const errorText = `${note.title}: ${resource.errors[0]}\n`;
              writeStream.write(errorText);
            }
          });
        });

        jsonData.passageOverview.resources.map((resource) => {
          if (resource.errors != null && resource.errors !== undefined) {
            const errorText = `passageOverview: ${resource.errors[0]}\n`;
            writeStream.write(errorText);
          }
        });

        console.log("unzipped", unzipDir);

        resolve(); // ✅ Signals completion
      } catch (parseError) {
        console.error("Invalid JSON format:", parseError);
        reject(parseError); // ⚠ Reject if JSON fails
      }
    });
  });
}
