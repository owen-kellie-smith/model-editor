import { describe, it, expect } from "vitest";
import { serializeDefinition, parseDefinitionXml } from "@/domain/serialize.js";

describe("serializeDefinition", () => {
  it("should serialize a simple expression definition", () => {
    const definition = {
      type: "expression",
      "#text": "1 + 1"
    };

    const xml = serializeDefinition(definition);
    
    expect(xml).toBe('<definition type="expression">\n  1 + 1\n</definition>');
  });

  it("should serialize a constant definition", () => {
    const definition = {
      type: "constant",
      "#text": "42"
    };

    const xml = serializeDefinition(definition);
    
    expect(xml).toBe('<definition type="constant">\n  42\n</definition>');
  });

  it("should serialize a table definition", () => {
    const definition = {
      type: "table",
      table: { ref: "cohort_data" },
      column: { ref: "annual_annuity_amount" }
    };

    const xml = serializeDefinition(definition);
    
    expect(xml).toContain('<definition type="table">');
    expect(xml).toContain('<table ref="cohort_data"></table>');
    expect(xml).toContain('<column ref="annual_annuity_amount"></column>');
    expect(xml).toContain('</definition>');
  });

  it("should serialize a piecewise definition", () => {
    const definition = {
      type: "piecewise",
      case: [
        {
          when: { "#text": "step = 0" },
          value: { "#text": "1" }
        },
        {
          when: { "#text": "step > 0" },
          value: { "#text": "survival_to_start_of_step(cohort, step - 1)" }
        }
      ]
    };

    const xml = serializeDefinition(definition);
    
    expect(xml).toContain('<definition type="piecewise">');
    expect(xml).toContain('<case>');
    expect(xml).toContain('<when>step = 0</when>');
    expect(xml).toContain('<value>1</value>');
    expect(xml).toContain('<when>step &gt; 0</when>'); // > is escaped to &gt;
    expect(xml).toContain('</definition>');
  });

  it("should serialize a tableLookup definition", () => {
    const definition = {
      type: "tableLookup",
      table: { ref: "mortality_rate" },
      row: { ref: "attained_age_years_floor" },
      columnSelector: { ref: "mortality_table" }
    };

    const xml = serializeDefinition(definition);
    
    expect(xml).toContain('<definition type="tableLookup">');
    expect(xml).toContain('<table ref="mortality_rate"></table>');
    expect(xml).toContain('<row ref="attained_age_years_floor"></row>');
    expect(xml).toContain('<columnSelector ref="mortality_table"></columnSelector>');
    expect(xml).toContain('</definition>');
  });

  it("should return empty string for null definition", () => {
    expect(serializeDefinition(null)).toBe("");
  });

  it("should return empty string for undefined definition", () => {
    expect(serializeDefinition(undefined)).toBe("");
  });

  it("should escape special XML characters in text content", () => {
    const definition = {
      type: "expression",
      "#text": "a < b && c > d"
    };

    const xml = serializeDefinition(definition);
    
    expect(xml).toContain("a &lt; b &amp;&amp; c &gt; d");
    expect(xml).not.toContain("a < b");
    expect(xml).not.toContain("c > d");
  });

  it("should escape quotes and apostrophes in attribute values", () => {
    const definition = {
      type: "test",
      attr: 'value with "quotes" and \'apostrophes\'',
      "#text": "content"
    };

    const xml = serializeDefinition(definition);
    
    expect(xml).toContain('attr="value with &quot;quotes&quot; and &apos;apostrophes&apos;"');
  });

  it("should escape ampersands in text content", () => {
    const definition = {
      type: "expression",
      "#text": "a && b || c && d"
    };

    const xml = serializeDefinition(definition);
    
    expect(xml).toContain("a &amp;&amp; b || c &amp;&amp; d");
  });
});

describe("parseDefinitionXml", () => {
  it("should parse a simple expression definition", () => {
    const xml = '<definition type="expression">1 + 1</definition>';
    
    const definition = parseDefinitionXml(xml);
    
    expect(definition.type).toBe("expression");
    expect(definition["#text"]).toBe("1 + 1");
  });

  it("should parse a constant definition", () => {
    const xml = '<definition type="constant">42</definition>';
    
    const definition = parseDefinitionXml(xml);
    
    expect(definition.type).toBe("constant");
    expect(definition["#text"]).toBe("42");
  });

  it("should parse a table definition", () => {
    const xml = `<definition type="table">
  <table ref="cohort_data"/>
  <column ref="annual_annuity_amount"/>
</definition>`;
    
    const definition = parseDefinitionXml(xml);
    
    expect(definition.type).toBe("table");
    expect(definition.table).toBeDefined();
    expect(definition.table.ref).toBe("cohort_data");
    expect(definition.column).toBeDefined();
    expect(definition.column.ref).toBe("annual_annuity_amount");
  });

  it("should parse a piecewise definition", () => {
    const xml = `<definition type="piecewise">
  <case>
    <when>step = 0</when>
    <value>1</value>
  </case>
  <case>
    <when>step &gt; 0</when>
    <value>survival_to_start_of_step(cohort, step - 1)</value>
  </case>
</definition>`;
    
    const definition = parseDefinitionXml(xml);
    
    expect(definition.type).toBe("piecewise");
    expect(Array.isArray(definition.case)).toBe(true);
    expect(definition.case).toHaveLength(2);
    expect(definition.case[0].when["#text"]).toBe("step = 0");
    expect(definition.case[0].value["#text"]).toBe("1");
    expect(definition.case[1].when["#text"]).toBe("step > 0");
  });

  it("should parse a tableLookup definition", () => {
    const xml = `<definition type="tableLookup">
  <table ref="mortality_rate"/>
  <row ref="attained_age_years_floor"/>
  <columnSelector ref="mortality_table"/>
</definition>`;
    
    const definition = parseDefinitionXml(xml);
    
    expect(definition.type).toBe("tableLookup");
    expect(definition.table.ref).toBe("mortality_rate");
    expect(definition.row.ref).toBe("attained_age_years_floor");
    expect(definition.columnSelector.ref).toBe("mortality_table");
  });

  it("should throw error for empty XML", () => {
    expect(() => parseDefinitionXml("")).toThrow("Definition XML cannot be empty");
  });

  it("should throw error for whitespace-only XML", () => {
    expect(() => parseDefinitionXml("   \n  ")).toThrow("Definition XML cannot be empty");
  });

  it("should throw error for non-definition root element", () => {
    expect(() => parseDefinitionXml("<variable>test</variable>")).toThrow("Expected <definition> element");
  });
});

describe("round-trip serialization", () => {
  it("should round-trip an expression definition", () => {
    const original = {
      type: "expression",
      "#text": "a + b * c"
    };

    const xml = serializeDefinition(original);
    const parsed = parseDefinitionXml(xml);
    
    expect(parsed.type).toBe(original.type);
    expect(parsed["#text"]).toBe(original["#text"]);
  });

  it("should round-trip a table definition", () => {
    const original = {
      type: "table",
      table: { ref: "test_table" },
      column: { ref: "test_column" }
    };

    const xml = serializeDefinition(original);
    const parsed = parseDefinitionXml(xml);
    
    expect(parsed.type).toBe(original.type);
    expect(parsed.table.ref).toBe(original.table.ref);
    expect(parsed.column.ref).toBe(original.column.ref);
  });

  it("should round-trip a piecewise definition with multiple cases", () => {
    const original = {
      type: "piecewise",
      case: [
        {
          when: { "#text": "x = 0" },
          value: { "#text": "0" }
        },
        {
          when: { "#text": "x > 0" },
          value: { "#text": "x * 2" }
        }
      ]
    };

    const xml = serializeDefinition(original);
    const parsed = parseDefinitionXml(xml);
    
    expect(parsed.type).toBe(original.type);
    expect(Array.isArray(parsed.case)).toBe(true);
    expect(parsed.case).toHaveLength(2);
    expect(parsed.case[0].when["#text"]).toBe(original.case[0].when["#text"]);
    expect(parsed.case[0].value["#text"]).toBe(original.case[0].value["#text"]);
    expect(parsed.case[1].when["#text"]).toBe(original.case[1].when["#text"]);
    expect(parsed.case[1].value["#text"]).toBe(original.case[1].value["#text"]);
  });
});
