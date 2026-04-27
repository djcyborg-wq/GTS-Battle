import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { imageSize } from "image-size";

type RawShape = {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  hasDashedLine: boolean;
  fillColor?: string;
};

const pptxPath =
  process.env.PPTX_PATH ?? path.resolve(__dirname, "../../../Schneidmesser.pptx");
const outputPath =
  process.env.STEPS_CONFIG_PATH ?? path.resolve(__dirname, "../../../assets/steps.config.json");
const clientPublicDir =
  process.env.CLIENT_PUBLIC_DIR ?? path.resolve(__dirname, "../../../client/public");

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

const asArray = <T>(value: T | T[] | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const toPx = (emu: number) => Math.round((emu / 914400) * 96);
const upper = (value?: string) => (value ?? "").toUpperCase();
const isRedTone = (hex?: string) => {
  const clean = upper(hex).replace("#", "");
  return clean.startsWith("FF") || clean.startsWith("C0") || clean.startsWith("D9");
};

const toInstruction = (raw: string): string => {
  const normalized = raw.trim().replace(/\s+/g, " ");
  if (!normalized) return normalized;
  const lower = normalized.toLowerCase();
  if (lower.includes("wähl") || lower.includes("waehl")) {
    return normalized;
  }
  return `${normalized} wählen`;
};

const normalizeTargetPath = (target: string) => {
  const normalized = target.replace(/\\/g, "/");
  if (normalized.startsWith("../")) {
    return path.posix.normalize(`ppt/slides/${normalized}`);
  }
  if (normalized.startsWith("ppt/")) {
    return path.posix.normalize(normalized);
  }
  return path.posix.normalize(`ppt/slides/${normalized}`);
};

type PictureReference = {
  offXPx: number;
  offYPx: number;
  extWidthPx: number;
  extHeightPx: number;
  cropLeft: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
};

type Transform = {
  offX: number;
  offY: number;
  scaleX: number;
  scaleY: number;
};

const defaultTransform: Transform = {
  offX: 0,
  offY: 0,
  scaleX: 1,
  scaleY: 1,
};

const extractText = (shape: Record<string, unknown>): string => {
  const txBody = shape["p:txBody"] as Record<string, unknown> | undefined;
  if (!txBody) return "";
  const paragraphs = asArray(txBody["a:p"] as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const parts: string[] = [];
  for (const paragraph of paragraphs as Record<string, unknown>[]) {
    const runs = asArray(paragraph["a:r"] as Record<string, unknown> | Record<string, unknown>[] | undefined);
    for (const run of runs as Record<string, unknown>[]) {
      const text = run["a:t"];
      if (typeof text === "string" && text.trim()) {
        parts.push(text.trim());
      }
    }
    const fallbackText = paragraph["a:t"];
    if (typeof fallbackText === "string" && fallbackText.trim()) {
      parts.push(fallbackText.trim());
    }
  }
  return parts.join(" ").trim();
};

const collectFromSpTree = (
  node: unknown,
  list: RawShape[],
  textParts: string[],
  transform: Transform,
): void => {
  if (!node || typeof node !== "object") return;
  const safe = node as Record<string, unknown>;

  for (const shape of asArray(
    safe["p:sp"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
  ) as Record<string, unknown>[]) {
    const nvSpPr = shape["p:nvSpPr"] as Record<string, unknown> | undefined;
    const cNvPr = nvSpPr?.["p:cNvPr"] as Record<string, string> | undefined;
    const spPr = shape["p:spPr"] as Record<string, unknown> | undefined;
    const xfrm = spPr?.["a:xfrm"] as Record<string, unknown> | undefined;
    const off = xfrm?.["a:off"] as Record<string, string> | undefined;
    const ext = xfrm?.["a:ext"] as Record<string, string> | undefined;
    const text = extractText(shape);
    if (text) {
      textParts.push(text);
    }
    const solidFill = spPr?.["a:solidFill"] as Record<string, unknown> | undefined;
    const fillSrgb = solidFill?.["a:srgbClr"] as Record<string, string> | undefined;
    const fillColor = fillSrgb?.val;
    const ln = spPr?.["a:ln"] as Record<string, unknown> | undefined;
    const dash = ln?.["a:prstDash"] as Record<string, string> | undefined;

    if (off?.x && off?.y && ext?.cx && ext?.cy) {
      const localX = Number(off.x);
      const localY = Number(off.y);
      const localW = Number(ext.cx);
      const localH = Number(ext.cy);
      list.push({
        id: cNvPr?.id ?? `shape-${list.length + 1}`,
        title: text || cNvPr?.name || `Bereich ${list.length + 1}`,
        x: toPx(transform.offX + localX * transform.scaleX),
        y: toPx(transform.offY + localY * transform.scaleY),
        width: toPx(localW * transform.scaleX),
        height: toPx(localH * transform.scaleY),
        rotation: xfrm?.rot ? Number(xfrm.rot) / 60000 : 0,
        hasDashedLine: dash?.val === "dash",
        fillColor,
      });
    }
  }

  for (const group of asArray(
    safe["p:grpSp"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
  ) as Record<string, unknown>[]) {
    const spPr = group["p:grpSpPr"] as Record<string, unknown> | undefined;
    const xfrm = spPr?.["a:xfrm"] as Record<string, unknown> | undefined;
    const off = xfrm?.["a:off"] as Record<string, string> | undefined;
    const ext = xfrm?.["a:ext"] as Record<string, string> | undefined;
    const chOff = xfrm?.["a:chOff"] as Record<string, string> | undefined;
    const chExt = xfrm?.["a:chExt"] as Record<string, string> | undefined;

    const groupOffX = Number(off?.x ?? 0);
    const groupOffY = Number(off?.y ?? 0);
    const groupExtX = Number(ext?.cx ?? 1);
    const groupExtY = Number(ext?.cy ?? 1);
    const childOffX = Number(chOff?.x ?? 0);
    const childOffY = Number(chOff?.y ?? 0);
    const childExtX = Number(chExt?.cx ?? groupExtX);
    const childExtY = Number(chExt?.cy ?? groupExtY);

    const scaleX = childExtX === 0 ? 1 : groupExtX / childExtX;
    const scaleY = childExtY === 0 ? 1 : groupExtY / childExtY;

    const groupTransform: Transform = {
      offX: transform.offX + (groupOffX - childOffX) * transform.scaleX,
      offY: transform.offY + (groupOffY - childOffY) * transform.scaleY,
      scaleX: transform.scaleX * scaleX,
      scaleY: transform.scaleY * scaleY,
    };

    collectFromSpTree(group, list, textParts, groupTransform);
  }
};

const collectPicturesFromSpTree = (node: unknown, pictures: PictureReference[]): void => {
  if (!node || typeof node !== "object") return;
  const safe = node as Record<string, unknown>;

  for (const pic of asArray(
    safe["p:pic"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
  ) as Record<string, unknown>[]) {
    const spPr = pic["p:spPr"] as Record<string, unknown> | undefined;
    const xfrm = spPr?.["a:xfrm"] as Record<string, unknown> | undefined;
    const off = xfrm?.["a:off"] as Record<string, string> | undefined;
    const ext = xfrm?.["a:ext"] as Record<string, string> | undefined;
    if (!off?.x || !off?.y || !ext?.cx || !ext?.cy) continue;

    const blipFill = pic["p:blipFill"] as Record<string, unknown> | undefined;
    const srcRect = blipFill?.["a:srcRect"] as Record<string, string> | undefined;
    const cropLeft = Number(srcRect?.l ?? 0) / 100000;
    const cropTop = Number(srcRect?.t ?? 0) / 100000;
    const cropRight = Number(srcRect?.r ?? 0) / 100000;
    const cropBottom = Number(srcRect?.b ?? 0) / 100000;

    pictures.push({
      offXPx: toPx(Number(off.x)),
      offYPx: toPx(Number(off.y)),
      extWidthPx: toPx(Number(ext.cx)),
      extHeightPx: toPx(Number(ext.cy)),
      cropLeft,
      cropTop,
      cropRight,
      cropBottom,
    });
  }

  for (const group of asArray(
    safe["p:grpSp"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
  ) as Record<string, unknown>[]) {
    collectPicturesFromSpTree(group, pictures);
  }
};

const run = async () => {
  const zip = await JSZip.loadAsync(readFileSync(pptxPath));
  const slides = Object.keys(zip.files)
    .filter((entry) => entry.startsWith("ppt/slides/slide") && entry.endsWith(".xml"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (slides.length === 0) {
    throw new Error("Keine Slides in PPTX gefunden.");
  }

  const presentationXml = await zip.files["ppt/presentation.xml"].async("string");
  const presentation = parser.parse(presentationXml) as Record<string, unknown>;
  const sldSz = (presentation["p:presentation"] as Record<string, unknown>)?.["p:sldSz"] as
    | Record<string, string>
    | undefined;
  const slideWidthPx = toPx(Number(sldSz?.cx ?? 12192000));
  const slideHeightPx = toPx(Number(sldSz?.cy ?? 6858000));

  const firstSlideRelsPath = "ppt/slides/_rels/slide1.xml.rels";
  let backgroundImageWidth = slideWidthPx;
  let backgroundImageHeight = slideHeightPx;
  let referencePicture: PictureReference | undefined;
  if (zip.files[firstSlideRelsPath]) {
    const relsXml = await zip.files[firstSlideRelsPath].async("string");
    const relsParsed = parser.parse(relsXml) as Record<string, unknown>;
    const relationships = asArray(
      ((relsParsed.Relationships as Record<string, unknown>)?.Relationship as
        | Record<string, string>
        | Record<string, string>[]
        | undefined),
    );
    const imageRel = relationships.find(
      (rel) => typeof rel.Type === "string" && rel.Type.includes("/image"),
    );
    if (imageRel?.Target) {
      const mediaPath = normalizeTargetPath(imageRel.Target);
      const file = zip.files[mediaPath];
      if (file) {
        const extension = path.extname(mediaPath) || ".png";
        const outputImage = path.resolve(clientPublicDir, `slide1-bg${extension}`);
        mkdirSync(clientPublicDir, { recursive: true });
        const buffer = await file.async("nodebuffer");
        writeFileSync(outputImage, buffer);
        const dimensions = imageSize(buffer);
        if (dimensions.width && dimensions.height) {
          backgroundImageWidth = dimensions.width;
          backgroundImageHeight = dimensions.height;
        }
        console.log(`Hintergrundbild exportiert: ${outputImage}`);
      }
    }
  }

  const slide1Xml = await zip.files["ppt/slides/slide1.xml"].async("string");
  const slide1Parsed = parser.parse(slide1Xml) as Record<string, unknown>;
  const slide1SpTree = ((slide1Parsed["p:sld"] as Record<string, unknown>)?.["p:cSld"] as
    | Record<string, unknown>
    | undefined)?.["p:spTree"] as Record<string, unknown> | undefined;
  const pictures: PictureReference[] = [];
  collectPicturesFromSpTree(slide1SpTree, pictures);
  referencePicture = pictures[0];

  const output = [];
  for (let index = 1; index < slides.length; index += 1) {
    const slideXml = await zip.files[slides[index]].async("string");
    const parsed = parser.parse(slideXml) as Record<string, unknown>;
    const spTree = (parsed["p:sld"] as Record<string, unknown>)?.["p:cSld"] as
      | Record<string, unknown>
      | undefined;
    const root = spTree?.["p:spTree"] as Record<string, unknown> | undefined;
    const shapes: RawShape[] = [];
    const textParts: string[] = [];
    collectFromSpTree(root, shapes, textParts, defaultTransform);

    const instructionRaw =
      textParts.find((part) => part.length > 2 && part.length < 120 && !part.toLowerCase().includes("step")) ??
      `Waehle den Bereich fuer Folie ${index + 1}`;
    const instructionText = toInstruction(instructionRaw);

    const areaCandidates = shapes.filter(
      (shape) => shape.hasDashedLine || isRedTone(shape.fillColor),
    );

    const areas = areaCandidates.map((shape, areaIndex) => {
      let x = Math.max(0, shape.x);
      let y = Math.max(0, shape.y);
      let width = Math.max(20, shape.width);
      let height = Math.max(20, shape.height);

      if (referencePicture) {
        const visibleWidthRatio = Math.max(0.01, 1 - referencePicture.cropLeft - referencePicture.cropRight);
        const visibleHeightRatio = Math.max(0.01, 1 - referencePicture.cropTop - referencePicture.cropBottom);
        const relX = (shape.x - referencePicture.offXPx) / Math.max(1, referencePicture.extWidthPx);
        const relY = (shape.y - referencePicture.offYPx) / Math.max(1, referencePicture.extHeightPx);
        const relW = shape.width / Math.max(1, referencePicture.extWidthPx);
        const relH = shape.height / Math.max(1, referencePicture.extHeightPx);

        x = (referencePicture.cropLeft + relX * visibleWidthRatio) * backgroundImageWidth;
        y = (referencePicture.cropTop + relY * visibleHeightRatio) * backgroundImageHeight;
        width = relW * visibleWidthRatio * backgroundImageWidth;
        height = relH * visibleHeightRatio * backgroundImageHeight;
      }

      return {
        id: `slide-${index + 1}-area-${areaIndex + 1}`,
        label: shape.title,
        shape: "ellipse",
        x: Math.max(0, Math.round(x)),
        y: Math.max(0, Math.round(y)),
        width: Math.max(20, Math.round(width)),
        height: Math.max(20, Math.round(height)),
        rotation: shape.rotation ?? 0,
      };
    });

    output.push({
      id: `step-${index}`,
      title: `Schritt ${index}`,
      instruction: instructionText,
      sourceSlide: slides[index],
      slideWidthPx: backgroundImageWidth,
      slideHeightPx: backgroundImageHeight,
      areas,
    });
  }

  writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`Step-Konfiguration gespeichert: ${outputPath}`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
