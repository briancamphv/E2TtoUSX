const { exec } = require("child_process");
const fs = require("fs");

const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");

const argv = yargs(hideBin(process.argv))
  .usage("$0 <docxPath> [--out output.md]")
  .demandCommand(1)
  .options({
    out: { type: "string", describe: "Output JSON path" },
  })
  .help().argv;

function convertDocxToMarkdown(inputPath, outputPath) {
  const cmd = `pandoc "${inputPath}" -f docx -t markdown  --wrap=none --track-changes=accept --preserve-tabs   -o "${outputPath}"`;

  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.warn(`⚠️ Warning: ${stderr}`);
    }
    console.log(`✅ Successfully converted to ${outputPath}`);
  });
}

// Usage example:
convertDocxToMarkdown(argv._[0], argv.out);
