"""Inspect actual PDFs produced by verify-receipt-templates.ts (offline)."""

import json
import re
import sys
from collections import Counter
from pathlib import Path
import pdfplumber

root = Path(sys.argv[1])
results = json.loads((root / "results.json").read_text())


def normalize(value: str) -> str:
    return re.sub(r"\s", "", value).lower()


analysis = []
for result in results:
    stem = f'{result["style"]}--{result["scenario"]}'
    with pdfplumber.open(root / f"{stem}.pdf") as document:
        pages = [page.extract_text() or "" for page in document.pages]
        text = normalize("\n".join(pages))
        flow_text = normalize(
            "\n".join(
                page.extract_text(use_text_flow=True) or "" for page in document.pages
            )
        )
        issues = []
        for field in ["number", "date"]:
            if normalize(result["expected"][field]) not in text:
                issues.append(f"missing {field}")
        for index in range(
            0
            if result["scenario"].startswith("preview-")
            else result["expected"]["itemCount"]
        ):
            item_id = f"ITEM{index+1:03}"
            if item_id.lower() not in text:
                issues.append(f"missing {item_id}")
        for name in result["expected"].get("itemNames", []):
            if normalize(name) not in flow_text:
                issues.append(f"missing/truncated item name {name[:12]}")
        if result["style"] == "standard":
            title = (
                "CUSTOM FOOTER TITLE"
                if result["scenario"] == "custom"
                else {
                    "base-en": "Thank you for your purchase!",
                    "base-ru": "Спасибо за покупку!",
                }.get(result["scenario"], "Дякуємо за покупку!")
            )
            label = {"base-en": "Total", "base-ru": "Итого"}.get(
                result["scenario"], "Разом"
            )
            for page in document.pages:
                footers = page.search(title, regex=False)
                totals = page.search(label, regex=False)
                if footers and totals and footers[0]["top"] < totals[-1]["bottom"]:
                    issues.append("footer overlaps total in PDF")
        if result["style"] in ["minimal", "corporate"] and len(pages) > 1:
            final_page = normalize(pages[-1])
            if (
                "item" not in final_page
                and normalize(result["expected"]["total"]) not in final_page
            ):
                issues.append("orphan footer/decorative last page")
        if result["style"] != "delivery":
            for amount, count in Counter(result["expected"]["lineTotals"]).items():
                # Every item amount must paint, even when the same amount repeats.
                actual = text.count(normalize(amount))
                if actual < count:
                    issues.append(f"line total {amount}: {actual}/{count}")
            if normalize(result["expected"]["total"]) not in text:
                issues.append("missing total")
        elif normalize(result["expected"]["total"]) in text:
            issues.append("delivery contains prices")
        if any(not page.strip() for page in pages):
            issues.append("blank/decorative-only page")
        if result["scenario"] == "wrap20":
            for index, pdf_page in enumerate(document.pages):
                page = pdf_page.extract_text(use_text_flow=True) or ""
                starts = len(re.findall(r"ITEM\d{3}", page))
                ends = page.count("END")
                if starts != ends:
                    issues.append(f"split row page{index+1}: {starts}starts/{ends}ends")
        if result["style"] == "thermal":
            if len(document.pages) != 1:
                issues.append("thermal not one continuous roll")
            if abs(document.pages[0].width - 80 * 72 / 25.4) > 1:
                issues.append("thermal width not 80mm")
            last_content = max(
                (char["bottom"] for char in document.pages[-1].chars), default=0
            )
            if document.pages[-1].height - last_content > 45:
                issues.append(
                    f"thermal trailing blank {document.pages[-1].height-last_content:.1f}pt"
                )
        outside = sum(
            1
            for page in document.pages
            for char in page.chars
            if char["x0"] < -0.5 or char["x1"] > page.width + 0.5
        )
        if outside:
            issues.append(f"{outside} characters outside page")
        # Global page shrink is visible in the PDF font metrics, even when DOM bounds look safe.
        fonts = [
            char["size"]
            for page in document.pages
            for char in page.chars
            if char["text"].isalnum()
        ]
        font_median = sorted(fonts)[len(fonts) // 2] if fonts else 0
        analysis.append(
            {
                "style": result["style"],
                "scenario": result["scenario"],
                "pages": len(pages),
                "pageSizes": [[page.width, page.height] for page in document.pages],
                "fontMedian": font_median,
                "issues": issues,
                "text": "\n\n".join(pages),
            }
        )
        print(
            f'{"FAIL" if issues else "PASS"} {stem}: {len(pages)}pages'
            + (f': {"; ".join(issues)}' if issues else "")
        )
for result in analysis:
    if result["scenario"] in ["wide-logo", "tall-logo", "logo4to1"]:
        base = next(
            case
            for case in analysis
            if case["style"] == result["style"] and case["scenario"] == "base-uk"
        )
        if result["fontMedian"] < base["fontMedian"] * 0.9:
            result["issues"].append(
                f'global font shrink {result["fontMedian"]:.2f}/{base["fontMedian"]:.2f}pt'
            )
(root / "pdf-analysis.json").write_text(
    json.dumps(analysis, ensure_ascii=False, indent=2)
)
failures = sum(bool(case["issues"]) for case in analysis)
print(f"{len(analysis)} PDFs; {failures} failures")
sys.exit(bool(failures))
