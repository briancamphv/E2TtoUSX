const fs = require("fs");
const readline = require("readline");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");

const argv = yargs(hideBin(process.argv))
  .version("1.0.1")
  .usage("$0 <docxPath> [--book <bookName>,--out output.xml]")
  .demandCommand(1)
  .options({
    out: { type: "string", describe: "Output XML path" },
    book: { type: "string", describe: "Book name (e.g., GEN, EXO, MAT, etc.)" },
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

console.log("Reading file: " + filePath);
console.log("Output file: " + argv.out);
console.log("Book name: " + argv.book);

writeStream.write(`<?xml version="1.0" encoding="UTF-8"?>\n`);
writeStream.write(`<usx>\n`);
writeStream.write(
  `<book code="${argv.book}" style="id">E2T (Easy to Translate Bible)</book>\n`
);

var section = 0;
var sectionPara = `<para style="s${section}">`;
var endOfPara = false;
var para = "";
var chapter = "";

rl.on("line", (line) => {
  if (line.startsWith("**")) {
    if (line.endsWith("**")) {
      if (isNumeric(line.substring(2, line.length - 2))) {
        var cNum = line.substring(2, line.length - 2);
        chapter = `<chapter number="${cNum}" style="c" sid="${argv.book} ${cNum}" />\n`;
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
  } else {
    console.log("line " + ndx + ": " + line);
  }

  //console.log("line " + ndx + ": " + line);
  //writeStream.write(line + '\n');
  ndx++;
});

rl.on("close", () => {
  console.log("Done reading file.");
});

function isNumeric(str) {
  if (typeof str != "string") return false; // we only process strings!
  return (
    !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !isNaN(parseFloat(str))
  ); // ...and ensure strings of whitespace fail
}
