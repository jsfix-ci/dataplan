const YAML = require('yaml');
const fs = require("fs").promises;

test("I can parse a use-case YAML file", async () => {
    const file = await fs.readFile('tests/resources/uc1.yaml', 'utf8');
    const data = YAML.parse(file);
    expect(data.name).toBe("Use-case 1");
    expect(data.author).toBe("John Doe");
    expect(data.businessCase.customerBenefits).toBe("If you're going to move some data, hopefully you know why.\n");
    expect(data.dataSources.length).toBe(1);
});
