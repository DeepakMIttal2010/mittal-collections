// Product `size` is one free-text English field (no sizeHi exists), e.g.
// "72 x 100 Inches (1 Bed Sheet + 2 Pillow Covers)". On Hindi pages every
// other spec value already switches language (fabricHi, washCareHi...), so
// the size row stayed the one English cell in an otherwise Hindi table.
//
// This translates the words and units (never the numbers) with phrase
// rules, longest/most specific first. Anything it doesn't recognise is left
// as-is, so a new size wording degrades to partly-English rather than
// breaking. English pages are returned untouched.
const RULES = [
  [/\bFits mattress up to ([\d.]+(?:\s*x\s*[\d.]+)?)\s*ft,\s*height up to ([\d.]+)"/gi, '$1 फीट तक के गद्दे पर फिट, ऊंचाई $2" तक'],
  [/\bSet of (\d+) Cushion Covers\b/gi, "$1 कुशन कवर का सेट"],
  [/\bSet of (\d+) Cushions\b/gi, "$1 कुशन का सेट"],
  [/\bBook-Style Gift Box\b/gi, "बुक-स्टाइल गिफ्ट बॉक्स"],
  [/\bStandard Single Bed Size\b/gi, "स्टैंडर्ड सिंगल बेड साइज़"],
  [/\bPillow (?:Covers?|Cases)\b/gi, "तकिया कवर"],
  [/\bFitted Bed ?sheet\b/gi, "फिटेड बेडशीट"],
  [/\bBed ?sheet\b/gi, "बेडशीट"],
  [/\bZig Zag\b/gi, "ज़िग-ज़ैग"],
  [/\bDrop\b/gi, "ड्रॉप"],
  [/\bHeight\b/gi, "ऊंचाई"],
  [/\bInch(?:es)?\b/gi, "इंच"],
  [/\bcm\b/gi, "सेमी"],
  [/\bft\b/gi, "फीट"],
  [/\b(\d+) included\b/gi, "$1 शामिल"],
];

export function localizeSize(size, isHindi) {
  if (!isHindi || !size) return size;

  return RULES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), size);
}
