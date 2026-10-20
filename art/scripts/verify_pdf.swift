// macOS fallback for PDF visual QA when Poppler is not installed.
import AppKit
import PDFKit

let args = CommandLine.arguments
guard args.count == 3, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])), let page = doc.page(at: 0) else {
    fatalError("Usage: swift scripts/verify_pdf.swift input.pdf preview.png")
}
let bounds = page.bounds(for: .mediaBox)
let widthMm = bounds.width * 25.4 / 72
let heightMm = bounds.height * 25.4 / 72
precondition(doc.pageCount == 1, "Expected one PDF page")
let trim = page.bounds(for: .trimBox)
precondition(abs(trim.width * 25.4 / 72 - 594) < 0.01 && abs(trim.height * 25.4 / 72 - 841) < 0.01, "Expected A1 portrait trim")
let bleed = trim.minX * 25.4 / 72
precondition(abs(bleed) < 0.01 || abs(bleed - 3) < 0.01, "Expected zero or 3 mm bleed")
precondition(abs(widthMm - 594 - 2 * bleed) < 0.01 && abs(heightMm - 841 - 2 * bleed) < 0.01, "Unexpected media size")
let thumbnail = page.thumbnail(of: NSSize(width: 1188, height: 1682), for: .mediaBox)
guard let tiff = thumbnail.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Could not render PDF")
}
try png.write(to: URL(fileURLWithPath: args[2]))
print("Verified: \(doc.pageCount) page, \(widthMm) × \(heightMm) mm; rendered to \(args[2])")
