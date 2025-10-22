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

   console.log("files",files)
  

  files.map(async (template) => {
    extractTemplateJson(template).then((template) => {
      reportOnTemplateData(template);
    });
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

function reportOnTemplateData(templateFile) {
  return new Promise((resolve, reject) => {
    readFile(templateFile, "utf8", (err, data) => {
      if (err) {
        console.error("Error reading file:", err);
        return reject(err);
      }

      try {
        const jsonData = JSON.parse(data);
        const bookname = jsonData.textTitle.bookName;

        writeStream.write(`**${jsonData.textTitle.title}**\n`);
        jsonData.sections.map((section) => {
          section.parts.map((part) => {
            if (part.picture !== null && part.picture.errors) {
              const errorText = `${bookname} ${part.chapter}:${part.verse}: ${part.picture.errors[0]}\n`;
              writeStream.write(errorText);
            }

            if (part.audio !== null && part.audio.errors) {
              const errorText = `${bookname} ${jsonData.textTitle.bookName} ${part.chapter}:${part.verse}: ${part.audio.errors[0]}\n`;
              writeStream.write(errorText);
            }

            part.commentaries.map((commentary) => {
              const title = commentary.title;

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
