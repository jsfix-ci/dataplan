#!/usr/bin/env node

const resolve = require("path").resolve;
const fs = require("fs");
const path = require("path");
const { findAllFilesSync, ofExtname } = require("find-files-by-patterns");
const nanoid = require("nanoid").nanoid;
const YAML = require('yaml');
const stringHash = require("string-hash");

const program = require("commander");

program
  .description(
    "Finds all the valid dataplan YAML files in a folder and aggregates them in markdown files."
  )
  .arguments("[paths...]")
  .option("-p, --prefix <prefix}", "A prefix for docusaurus links")
  .option(
    "-o, --output <path>",
    "A folder path where to send the resulting files. Defaults to current folder."
  )
  .action(function (args) {
    run(args);
  })
  .parse(process.argv);

async function run(args) {
    if (args.length !== 1) {
        console.error("Exactly one file is needed as the top level use-case");
        process.exit(1);
    }

    args = args.map((name) => resolve(name));

    const output = program._optionValues.output;

    let destination = resolve('.');
    if(output) {
        destination = resolve(output);
    }

    // Find all the files to process
    const filepath = args[0];
    if(fs.lstatSync(filepath).isDirectory()) {
        throw new Error("Use case file must not be a directory");
    }
    const root = path.parse(filepath).dir;

    await process(filepath, destination, root);
}

async function process(file, destination, root) {
    fs.mkdirSync(destination, { recursive: true });

    const index = {}
    const rootId = await processFile(file, destination, root, index);

    processIndex(index, destination, rootId);
}

async function processIndex(index, destinationDir, rootId) {
    const location = path.join(destinationDir, "index.md");
    let out = fs.createWriteStream(location);
    out.println = str => {
        if(str) out.write(str);
        out.write('\n');
    };

    rootUseCase = index[rootId];

    out.println("---");
    out.println(`title: ${rootUseCase.name}`);
    out.println("---");
    out.println();
    out.println(`The following diagram depicts the use-cases involved in the "${rootUseCase.name}" use-case. Select the use-case to see the related data management plan.`);
    out.println();
    out.println("import Mermaid from '@theme/Mermaid';");
    out.println();
    out.println("<Mermaid chart={`");
    out.println("    flowchart TD");
    for (const [key, value] of Object.entries(index)) {
        out.println(`    ${key}([<a href='../${key}/index.html'>${value.name}</a>])`);
    }
    for (const [key, value] of Object.entries(index)) {
        for(const link of value.links) {
            out.println(`    ${key} --> ${link}`);
        }
    }
    out.println("`}/>");
    out.println();

    const prefix = program._optionValues.prefix;
    const result = `| [${rootUseCase.name}](${prefix}/index/index.html) | ${rootUseCase.author} |`;
    console.error(result);
}

async function processFile(file, destination, root, index) {
    const id = `${stringHash(file)}`;

    if(index[id]) return id;

    console.log(`Processing ${file}: ${id}`);
    const yaml = await fs.promises.readFile(file, 'utf8');
    const uc = YAML.parse(yaml);

    await processUseCase(id, uc, destination, root, index);

    return id;
}

async function processUseCase(id, uc, destinationDir, root, index) {
    if(!uc.name) throw Error("Missing use-case name");

    const location = path.join(destinationDir, `${id}.md`);

    index[id] = { name: uc.name, author: uc.author, links: []};

    let out = fs.createWriteStream(location);
    out.println = str => {
        if(str) out.write(str);
        out.write('\n');
    };

    out.header = (level, str) => {
        out.write(`${"#".repeat(level)} ${str}\n\n`);
    }

    out.println("---");
    out.println(`title: ${uc.name}`);
    out.println("---");
    out.println();

    out.println("import Mermaid from '@theme/Mermaid';");
    out.println();

    if(!uc.author) throw Error("Missing author");
    if(!uc.email) throw Error("Missing email");
    out.println(`Author: ${uc.author} (${uc.email})`);
    out.println();

    out.header(2, "Business Case");
    out.header(3, "Description");
    out.println(uc.businessCase.description);
    out.println();
    out.header(3, "Benefits to Our Customers");
    out.println(uc.businessCase.customerBenefits);
    out.println();

    if(uc.dataSources) {
        if(uc.dataSources.length === 1) {
            processDataSource(uc.dataSources[0], out, 2);
        }
        else if(uc.dataSources.length > 1) {
            out.header(2, "Data Sources");
            for(ds of uc.dataSources) {
                processDataSource(ds, out, 3)
            }
        }
    }

    if(uc.subUseCases && uc.subUseCases.length > 0) {
        out.header(3, "Descendant use-cases");
        for(sub of uc.subUseCases) {
            const subId = await processFile(resolve(path.join(root, sub)), destinationDir, root, index);
            index[id].links.push(subId);

            const suc = index[subId];
            out.println(`- [${suc.name}](../${subId}/index.html)`);
        }
    }

    return location;
}

function processDataSource(ds, out, baseLevel) {
    if(!ds.name) throw Error(`Missing data source name`);

    if(!ds.description) throw Error(`[${ds.name}] Missing data source description`);
    if(!ds.flowChart) throw Error(`[${ds.name}] Missing data source flowChart`);
    if(!ds.permittedUse) throw Error(`[${ds.name}] Missing data source permitted use`);
    if(!ds.retention) throw Error(`[${ds.name}] Missing data source retention`);
    if(!ds.data || ds.data.length === 0) throw Error(`[${ds.name}] Missing data attributes in data source`);

    out.header(baseLevel, `Data Source: ${ds.name}`);

    out.header(baseLevel+1, "Description");
    out.println(ds.description);
    out.println();
    out.header(baseLevel+1, "Data flow");
    out.println("<Mermaid chart={`");
    out.println(ds.flowChart);
    out.println("`}/>");
    out.println();
    out.header(baseLevel+1, "Permitted use");
    out.println(ds.permittedUse);
    out.println();
    out.header(baseLevel+1, "Retention");
    out.println(ds.retention);
    out.println();

    out.header(baseLevel+1, "Data attributes");

    ds.data.forEach(obj => processObject(obj, ds, out, baseLevel+1));
}

function processObject(obj, ds, out, baseLevel) {
    if(!obj.name) throw Error(`[${ds.name}] Missing object name`);
    if(!obj.attributes || obj.attributes.length === 0) throw Error(`[${ds.name}.${obj.name}] Missing object attributes`);

    out.header(baseLevel+1, obj.name);

    out.println("| Name | Description |");
    out.println("| ---- | ----------- |");
    obj.attributes.forEach(attribute => processAttribute(attribute, obj, ds, out, baseLevel));
    out.println();
}

function processAttribute(attribute, obj, ds, out, baseLevel) {
    if(!attribute.name) throw Error(`[${ds.name}/${obj.name}] Missing attribute name`);
    if(!attribute.description) throw Error(`[${ds.name}/${obj.name}/${attribute.name}] Missing attribute description`);

    out.println(`| ${attribute.name} | ${attribute.description} |`);
}
