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

const SLIDE_NS = `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"`;
const SHAPE_PROPERTIES = `<p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="914400"/></a:xfrm><a:solidFill><a:srgbClr val="FFCC00"/></a:solidFill></p:spPr>`;
const TABLE_CELL_PROPERTIES = `<a:tcPr marL="91440"><a:solidFill><a:srgbClr val="EEEEEE"/></a:solidFill></a:tcPr>`;

function tableCell(text: string): string {
  return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1200"/><a:t>${text}</a:t></a:r></a:p></a:txBody>${TABLE_CELL_PROPERTIES}</a:tc>`;
}

/** The second slide of the deck: stored as `slide1.xml`, listed after `slide2.xml`. */
export const PPTX_FIXTURE_CONTENT_SLIDE = [
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
  `<p:sld ${SLIDE_NS}><p:cSld>`,
  `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="112233"/></a:solidFill></p:bgPr></p:bg>`,
  `<p:spTree>`,
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/>`,
  `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="3200" b="1"/><a:t>Quarterly review</a:t></a:r><a:endParaRPr lang="en-US" sz="3200"/></a:p></p:txBody></p:sp>`,
  `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/></p:nvSpPr>${SHAPE_PROPERTIES}<p:txBody><a:bodyPr/><a:lstStyle/>`,
  // PowerPoint splits one sentence into several runs for spell-check marks and language tags.
  `<a:p><a:r><a:rPr lang="en-US" sz="1800"/><a:t>Revenue grew </a:t></a:r><a:r><a:rPr lang="en-US" sz="1800" b="1"/><a:t>12%</a:t></a:r><a:r><a:rPr lang="en-US" sz="1800"/><a:t> this quarter &amp; costs fell.</a:t></a:r></a:p>`,
  `<a:p><a:r><a:rPr lang="en-US"/><a:t>Read </a:t></a:r><a:r><a:rPr lang="en-US"><a:hlinkClick r:id="rId2"/></a:rPr><a:t>the full report</a:t></a:r></a:p>`,
  `<a:p><a:r><a:rPr lang="en-US" sz="1400"/><a:t>North</a:t></a:r><a:br><a:rPr lang="en-US" sz="1400"/></a:br><a:r><a:rPr lang="en-US" sz="1400"/><a:t>South</a:t></a:r></a:p>`,
  `<a:p><a:endParaRPr lang="en-US"/></a:p>`,
  `</p:txBody></p:sp>`,
  `<p:sp><p:nvSpPr><p:cNvPr id="4" name="Slide Number"/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="en-US"/><a:t>2</a:t></a:fld></a:p></p:txBody></p:sp>`,
  `<p:pic><p:nvPicPr><p:cNvPr id="5" name="Logo"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId3"/></p:blipFill><p:spPr/></p:pic>`,
  `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="6" name="Table"/></p:nvGraphicFramePr><p:xfrm><a:off x="457200" y="4572000"/><a:ext cx="5486400" cy="914400"/></p:xfrm>`,
  `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid><a:gridCol w="2743200"/><a:gridCol w="2743200"/></a:tblGrid>`,
  `<a:tr h="370840">${tableCell("Plan")}${tableCell("Price")}</a:tr>`,
  `<a:tr h="370840">${tableCell("Pro")}${tableCell("$10")}</a:tr>`,
  `</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`,
  `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="a14"><p:sp><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>Margin formula</a:t></a:r></a:p></p:txBody></p:sp></mc:Choice>`,
  `<mc:Fallback><p:sp><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>Margin formula</a:t></a:r></a:p></p:txBody></p:sp></mc:Fallback></mc:AlternateContent>`,
  `</p:spTree></p:cSld></p:sld>`,
].join("");

/** The first slide of the deck. */
export const PPTX_FIXTURE_COVER_SLIDE = `<p:sld ${SLIDE_NS}><p:cSld><p:spTree><p:sp><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US" sz="4400"/><a:t>Acme Corp</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;

/**
 * A PowerPoint package with two slides stored out of order, a background, mixed formatting,
 * a link, a line break, a slide number, a picture, a table, notes, a layout, and a chart.
 */
export const PPTX_FIXTURE_ENTRIES = {
  "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
  "ppt/presentation.xml": `<p:presentation ${SLIDE_NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="257" r:id="rId3"/><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>`,
  "ppt/_rels/presentation.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>`,
  "ppt/slides/slide1.xml": PPTX_FIXTURE_CONTENT_SLIDE,
  "ppt/slides/slide2.xml": PPTX_FIXTURE_COVER_SLIDE,
  "ppt/slides/_rels/slide1.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/report" TargetMode="External"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`,
  "ppt/notesSlides/notesSlide1.xml": `<p:notes ${SLIDE_NS}><p:cSld><p:spTree><p:sp><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>Mention the new pricing</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`,
  "ppt/slideLayouts/slideLayout1.xml": `<p:sldLayout ${SLIDE_NS}><p:cSld><p:spTree><p:sp><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>Click to edit title</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sldLayout>`,
  "ppt/slideMasters/slideMaster1.xml": `<p:sldMaster ${SLIDE_NS}><p:cSld><p:spTree/></p:cSld></p:sldMaster>`,
  "ppt/charts/chart1.xml": `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Revenue by region</a:t></a:r></a:p></c:rich></c:tx></c:title></c:chart></c:chartSpace>`,
  "ppt/media/image1.png": "\u0089PNG binary",
};

export async function buildPptxFixture(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(PPTX_FIXTURE_ENTRIES)) {
    // PowerPoint writes parts only, without directory entries.
    zip.file(name, content, { createFolders: false });
  }
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}
