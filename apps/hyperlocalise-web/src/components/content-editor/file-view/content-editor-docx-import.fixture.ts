/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import JSZip from "jszip";

const NAMESPACES = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
const XML_HEADER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;

function paragraph(properties: string, ...runs: string[]) {
  return `<w:p><w:pPr>${properties}</w:pPr>${runs.join("")}</w:p>`;
}

function run(text: string, properties = "") {
  return `<w:r><w:rPr>${properties}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
}

function cell(text: string, properties = "") {
  return `<w:tc><w:tcPr>${properties}</w:tcPr>${paragraph("", run(text))}</w:tc>`;
}

// As Word writes it: most formatting lives in styles, and one sentence is split into many runs.
const STYLES = `${XML_HEADER}<w:styles ${NAMESPACES}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="56"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="2F5496"/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Callout"><w:name w:val="Callout"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:color w:val="C00000"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="CalloutStrong"><w:name w:val="Callout Strong"/><w:basedOn w:val="Callout"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/></w:style>
<w:style w:type="character" w:styleId="Accent"><w:name w:val="Accent"/><w:rPr><w:b/><w:color w:val="00B050"/></w:rPr></w:style>
</w:styles>`;

const NUMBERING = `${XML_HEADER}<w:numbering ${NAMESPACES}>
<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

const RELATIONSHIPS = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/docs" TargetMode="External"/>
</Relationships>`;

function listItem(text: string, numId: number, level: number) {
  return paragraph(
    `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr>`,
    run(text),
  );
}

const DOCUMENT = `${XML_HEADER}<w:document ${NAMESPACES}><w:body>
${paragraph(`<w:pStyle w:val="Title"/>`, run("Annual report"))}
${paragraph(`<w:pStyle w:val="Heading1"/>`, run("Over"), `<w:proofErr w:type="spellStart"/>`, run("view"))}
${paragraph(
  "",
  run("Plain "),
  run("big red", `<w:color w:val="FF0000"/><w:sz w:val="36"/>`),
  run(" marked", `<w:highlight w:val="yellow"/>`),
  run(" accent", `<w:rStyle w:val="Accent"/>`),
)}
${paragraph(`<w:pStyle w:val="CalloutStrong"/>`, run("Callout text"))}
${paragraph(`<w:pStyle w:val="Callout"/><w:jc w:val="right"/>`, run("Override", `<w:i w:val="0"/>`))}
${paragraph("")}
${listItem("Bullet", 1, 0)}
${listItem("Nested", 1, 1)}
${listItem("Step", 2, 0)}
${paragraph(
  "",
  run("See"),
  `<w:r><w:tab/></w:r>`,
  `<w:hyperlink r:id="rId7">${run("the docs")}</w:hyperlink>`,
)}
${paragraph("", `<w:r><w:t>Line one</w:t><w:br/><w:t>Line two</w:t></w:r>`)}
<w:tbl><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="6000"/></w:tblGrid>
<w:tr>${cell("Merged across", `<w:gridSpan w:val="2"/>`)}</w:tr>
<w:tr>${cell("Tall", `<w:vMerge w:val="restart"/>`)}${cell("B")}</w:tr>
<w:tr>${cell("", `<w:vMerge/>`)}${cell("C")}</w:tr>
<w:tr><w:trPr><w:gridBefore w:val="1"/></w:trPr>${cell("Offset")}</w:tr>
</w:tbl>
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
</w:body></w:document>`;

/** A Word file whose text size, colour, and alignment mostly come from its styles. */
export async function buildStyledDocxFixture(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
  );
  zip.file("word/document.xml", DOCUMENT);
  zip.file("word/styles.xml", STYLES);
  zip.file("word/numbering.xml", NUMBERING);
  zip.file("word/_rels/document.xml.rels", RELATIONSHIPS);
  return zip.generateAsync({ type: "arraybuffer" });
}

/** A Word file with only a document body, for cases the styled fixture does not cover. */
export async function buildDocxWithBody(body: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `${XML_HEADER}<w:document ${NAMESPACES}><w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "arraybuffer" });
}
