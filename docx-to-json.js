#!/usr/bin/env node
/**
 * Convert a .docx file to JSON by unzipping and parsing the XML parts.
 * Usage:
 *   node docx-to-json.js input.docx --out output.json --text
 *
 * Flags:
 *   --out   Path to write JSON (default: prints to stdout)
 *   --text  Also include a naive plain-text extraction from document.xml
 */

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const { XMLParser } = require("fast-xml-parser");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");

const argv = yargs(hideBin(process.argv))
  .usage("$0 <docxPath> [--out out.json] [--text]")
  .demandCommand(1)
  .options({
    out: { type: "string", describe: "Output JSON path" },
    text: { type: "boolean", describe: "Include naive plain-text extraction", default: false },
  })
  .help()
  .argv;

const inputPath = path.resolve(argv._[0]);
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  preserveOrder: false,
  trimValues: false,
});

async function loadZip(filePath) {
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  return zip;
}

async function readText(zip, file) {
  const entry = zip.file(file);
  if (!entry) return null;
  return await entry.async("text");
}

async function parseXml(zip, file) {
  const text = await readText(zip, file);
  if (!text) return null;
  try {
    return parser.parse(text);
  } catch (e) {
    return { _parseError: e.message, _raw: text };
  }
}

function listMedia(zip) {
  const results = [];
  zip.forEach((relativePath, file) => {
    if (relativePath.startsWith("word/media/") && !file.dir) {
      results.push({
        path: relativePath,
        size: file._data ? file._data.uncompressedSize : undefined,
      });
    }
  });
  return results;
}

/** Very naive traversal to pull paragraph/run text from document.xml */
function extractPlainText(docJson) {
  if (!docJson || !docJson["w:document"]) return "";

  const body = docJson["w:document"]["w:body"];
  if (!body) return "";

  const paras = Array.isArray(body["w:p"]) ? body["w:p"] : (body["w:p"] ? [body["w:p"]] : []);
  const getRuns = (p) => {
    const r = p["w:r"];
    if (!r) return [];
    return Array.isArray(r) ? r : [r];
  };

  const getTextsFromRun = (run) => {
    // text can be "w:t" string or object { "#text": "..." }
    const t = run["w:t"];
    if (!t) return "";
    if (typeof t === "string") return t;
    if (typeof t === "object" && t["#text"] != null) return t["#text"];
    return "";
  };

  const lines = [];
  for (const p of paras) {
    const runs = getRuns(p);
    const line = runs.map(getTextsFromRun).join("");
    lines.push(line);
  }
  return lines.join("\n");
}

(async () => {
  try {
    const zip = await loadZip(inputPath);

    // Core parts
    const [
      documentXml,
      stylesXml,
      numberingXml,
      settingsXml,
      themeXml,
      corePropsXml,
      appPropsXml,
      footnotesXml,
      endnotesXml,
      commentsXml,
      relsDocXml,
    ] = await Promise.all([
      parseXml(zip, "word/document.xml"),
      parseXml(zip, "word/styles.xml"),
      parseXml(zip, "word/numbering.xml"),
      parseXml(zip, "word/settings.xml"),
      parseXml(zip, "word/theme/theme1.xml"),
      parseXml(zip, "docProps/core.xml"),
      parseXml(zip, "docProps/app.xml"),
      parseXml(zip, "word/footnotes.xml"),
      parseXml(zip, "word/endnotes.xml"),
      parseXml(zip, "word/comments.xml"),
      parseXml(zip, "word/_rels/document.xml.rels"),
    ]);

    const media = listMedia(zip);

    const result = {
      meta: {
        source: path.basename(inputPath),
        generatedAt: new Date().toISOString(),
      },
      parts: {
        document: documentXml,
        styles: stylesXml,
        numbering: numberingXml,
        settings: settingsXml,
        theme: themeXml,
        relationships: relsDocXml,
        properties: {
          core: corePropsXml,
          app: appPropsXml,
        },
        notes: {
          footnotes: footnotesXml,
          endnotes: endnotesXml,
        },
        comments: commentsXml,
      },
      media,
    };

    if (argv.text) {
      result.plainText = extractPlainText(documentXml);
    }

    const json = JSON.stringify(result, null, 2);
    if (argv.out) {
      fs.writeFileSync(argv.out, json);
      console.log(`✔ Wrote JSON to ${path.resolve(argv.out)}`);
    } else {
      console.log(json);
    }
  } catch (err) {
    console.error("Failed to process DOCX:", err.message);
    process.exit(1);
  }
})();
