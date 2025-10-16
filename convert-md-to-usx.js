const fs = require("fs");
const readline = require("readline");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");

const argv = yargs(hideBin(process.argv))
  .version("1.0.1")
  .usage(
    "$0 <docxPath> [--book <bookName>,--out output.xml, --templates template.json]"
  )
  .demandCommand(1)
  .options({
    out: { type: "string", describe: "Output XML path" },
    book: { type: "string", describe: "Book name (e.g., GEN, EXO, MAT, etc.)" },
    templates: { type: "string", describe: "Template JSON" },
  })
  .help().argv;

const filePath = argv._[0]; // change this to your file

const readStream = fs.createReadStream(filePath, "utf8");
const writeStream = fs.createWriteStream(argv.out, { flags: "w" });

const rl = readline.createInterface({
  input: readStream,
  crlfDelay: Infinity, // handles \r\n and \n correctly
});

var ndx = 0;

//logic to load notes datastore

const templates = String(argv.templates).split(",");

console.log("template: " + templates[1]);

writeStream.write(`<?xml version="1.0" encoding="UTF-8"?>\n`);
writeStream.write(`<usx>\n`);
writeStream.write(
  `<book code="${argv.book}" style="id">E2T (Easy to Translate Bible)</book>\n`
);

var section = 0;
var sectionPara = `<para style="s${section}">`;
var endOfPara = false;
var passageStarted = false;
var para = "";
var passage = "";
var chapter = "";
var chapterEnd = "";
var cNum = 0;


rl.on("line", (line) => {
  if (line.startsWith("**")) {
    if (line.endsWith("**")) {
      if (isNumeric(line.substring(2, line.length - 2))) {
        if (chapterEnd != "") {
          writeStream.write(chapterEnd);
        }
        cNum = line.substring(2, line.length - 2);
        chapter = `<chapter number="${cNum}" style="c" sid="${argv.book} ${cNum}" />\n`;
        chapterEnd = `<chapter eid="${argv.book} ${cNum}" />\n`;
        writeStream.write(chapter);
      } else {
        para = sectionPara + line.substring(2, line.length - 2) + "</para>\n";
        writeStream.write(para);
        para = "";
        endOfPara = true;
        section++;
        sectionPara = `<para style="s${section}">`;
      }
    } else {
      endOfPara = false;
      para = sectionPara + line.substring(2) + " ";
    }
  } else if (line.endsWith("**")) {
    para = para + line.substring(0, line.length - 2) + "</para>\n";
    writeStream.write(para);
    para = "";
    endOfPara = true;
    section++;
    sectionPara = `<para style="s${section}">`;
  } else if (endOfPara === false) {
    para = para + line + " ";
  } else if (passageStarted) {
    if (line === "") {
      //end of passage logic
      writeStream.write('<para style="p">\n');
      passageParaMarkUp(passage);
      writeStream.write("</para>\n");
      passage = "";
      passageStarted = false;
    } else {
      passage += " " + line;
    }
  } else if (line.includes("^")) {
    passageStarted = true;
    passage = line;
  }

  //console.log("line " + ndx + ": " + line);
  //writeStream.write(line + '\n');
  ndx++;
});

rl.on("close", () => {
  if (passage !== "") {
    passageParaMarkUp(passage);
    writeStream.write("</para>\n");
  }

  if (chapterEnd != "") {
    writeStream.write(chapterEnd);
  }

  writeStream.write("\n</usx>");
  console.log("Done reading file.");
});

function isNumeric(str) {
  if (typeof str != "string") return false; // we only process strings!
  return (
    !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !isNaN(parseFloat(str))
  ); // ...and ensure strings of whitespace fail
}

function passageParaMarkUp(str) {
  passage = new String(str);
  var italicsOn = true;
  var delayedCharWrite = false;

  //<char style="add"></char>

  var closePos = 0;

  //  <verse number="1" style="v" sid="3JN 1:1" />

  var startVerseBlock = "";
  var endVerseBlock = "";

  for (let index = 0; index < passage.length; index++) {
    const char = passage[index];
    if (char === "^") {
      if (endVerseBlock !== "") {
        writeStream.write(endVerseBlock);
      }
      closePos = passage.indexOf("^", index + 1);
      const vNum = String(passage.substring(index, closePos + 1)).replace(
        /\D/g,
        ""
      );
      startVerseBlock = `<verse number="${vNum}" style="v" sid="${argv.book} ${cNum}:${vNum}" />\n`;
      endVerseBlock = `\n<verse number="${vNum}" eid="${argv.book} ${cNum}:${vNum}" />\n`;

      if (isNumeric(vNum)) {
        writeStream.write(startVerseBlock);
      } else {
        endVerseBlock = "";
      }

      if (delayedCharWrite) {
        writeStream.write('<char style="add">');
        delayedCharWrite = false;
        italicsOn = !italicsOn;
      }
      index = closePos;
    } else {
      if (char === "*") {
        if (passage[index + 1] === "^") {
          delayedCharWrite = true;
        } else if (italicsOn) {
          writeStream.write('<char style="add">');
          italicsOn = !italicsOn;
        } else {
          writeStream.write("</char>");
          italicsOn = !italicsOn;
        }
        //   index += 1;
        //writeStream.write(char);
      } else {
        writeStream.write(char);
      }
    }
  }

  if (endVerseBlock !== "") {
    writeStream.write(endVerseBlock);
  }
}
