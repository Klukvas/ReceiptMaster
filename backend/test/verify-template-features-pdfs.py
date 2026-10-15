"""Inspect this task's actual Chrome PDFs; no historical PDF matrix is reused."""
import json
import logging
import re
import sys
from pathlib import Path
import pdfplumber
from pypdf import PdfReader

logging.basicConfig(level=logging.INFO, format="%(message)s")
root = Path(sys.argv[1])
manifest = json.loads((root / "manifest.json").read_text())
results: list[dict[str, object]] = []
for scenario in manifest:
    pdf = root / f'{scenario["name"]}.pdf'
    reader = PdfReader(pdf)
    issues: list[str] = []
    with pdfplumber.open(pdf) as document:
        text = "\n".join(page.extract_text() or "" for page in document.pages)
        compact = re.sub(r"\s", "", text)
        expected_date = scenario.get("expectedDate")
        if expected_date and re.sub(r"\s", "", expected_date) not in compact:
            issues.append("missing frozen formatted date")
        if scenario["name"].startswith("date-numeric-") and "2026" not in text:
            issues.append("legacy numeric date lost four-digit year")
        if "PDF-000123" not in text:
            issues.append("missing document number")
        if "NorthStarStudio" not in compact:
            issues.append("missing company name")
        if "Дякуємо" not in text:
            issues.append("missing custom footer")
        if "[object Object]" in text or "undefined" in text or "NaN" in text:
            issues.append("invalid rendered value")
        for page in document.pages:
            outside = [char for char in page.chars if char.get("text", "").strip() and (char["x0"] < -1 or char["x1"] > page.width + 1 or char["top"] < -1 or char["bottom"] > page.height + 1)]
            if outside:
                issues.append(f"{len(outside)} glyphs outside page bounds")
        expected_width = 80 / 25.4 * 72 if scenario["id"] == "thermal" else 210 / 25.4 * 72
        if abs(float(reader.pages[0].mediabox.width) - expected_width) > 1:
            issues.append("wrong paper width")
        if scenario["name"].startswith("standard-long") and len(reader.pages) < 2:
            issues.append("long A4 did not paginate")
        if scenario["name"] == "compact-en":
            # Matrix explicitly centers the slot, allowing flex shrink. Check
            # intrinsic wide-image aspect and legacy maximum, not a fixed 52px height.
            for page in document.pages:
                for image in page.images:
                    if image["width"] > 150.8 or abs(image["width"] / image["height"] - 800 / 180) > 0.08:
                        issues.append("Compact automatic wide logo lost aspect or legacy maximum")
        manual = scenario["config"]["logo"]["size"] != "auto"
        max_width = 120 if manual and scenario["id"] == "thermal" else 200
        max_height = 72 if manual and scenario["id"] == "thermal" else 80 if not manual and scenario["id"] == "corporate" else 120
        for page in document.pages:
            for image in page.images:
                # Vintage's existing CSS color filter rasterizes a padded bitmap.
                # Strict element dimensions are checked separately in the DOM matrix.
                raster_padding = 2 if scenario["id"] == "vintage" else 0.8
                if image["width"] > max_width * 0.75 + raster_padding or image["height"] > max_height * 0.75 + raster_padding:
                    issues.append("logo exceeds automatic legacy or manual geometry bounds")
                if image["x0"] < -1 or image["x1"] > page.width + 1 or image["top"] < -1 or image["bottom"] > page.height + 1:
                    issues.append("logo outside printable page")
        if scenario["id"] == "delivery" and any(value in text for value in ["UAH", "199.99", "199,99"]):
            issues.append("Delivery leaked monetary values")
        if scenario["id"] == "proforma" and "30" not in text:
            issues.append("missing Proforma payment terms")
        results.append({"name": scenario["name"], "pages": len(reader.pages), "width": float(reader.pages[0].mediabox.width), "height": float(reader.pages[0].mediabox.height), "glyphs": sum(len(page.chars) for page in document.pages), "issues": issues})
(root / "pdf-analysis.json").write_text(json.dumps(results, indent=2))
failed = [value for value in results if value["issues"]]
logging.info("%s PDFs inspected; %s passed; %s failed", len(results), len(results) - len(failed), len(failed))
for value in failed:
    logging.error("%s: %s", value["name"], value["issues"])
sys.exit(bool(failed))
