#!/usr/bin/env node

const program = require("commander");
const fs = require("fs");
const path = require("path");

const appHome = path.dirname(require.main.filename);

fs.readFile(`${appHome}/package.json`, "utf8", function (err, data) {
    if (err) throw err;
    const package = JSON.parse(data);

    program
      .version(package.version, "-v, --version")
      .description("A data management plan aggregator.")
      .command("build", "Aggregates all the plans in a folder into markdown documenation.")
      .parse(process.args);
  });