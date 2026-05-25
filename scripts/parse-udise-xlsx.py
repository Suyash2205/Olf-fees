#!/usr/bin/env python3
"""Parse UDISE export xlsx → JSON rows for import script."""
import json
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def read_xlsx(path: str) -> list[list[str]]:
    with zipfile.ZipFile(path) as z:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall(".//m:si", NS):
                texts = [t.text or "" for t in si.findall(".//m:t", NS)]
                shared.append("".join(texts))
        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
        rows: list[list[str]] = []
        for row in sheet.findall(".//m:sheetData/m:row", NS):
            cells: list[str] = []
            for c in row.findall("m:c", NS):
                v = c.find("m:v", NS)
                if v is None or v.text is None:
                    cells.append("")
                elif c.get("t") == "s":
                    cells.append(shared[int(v.text)])
                else:
                    cells.append(v.text)
            rows.append(cells)
    return rows


def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else (
        "/Users/suyash/Downloads/27210700578_Students_Details 2025-26 (5).xlsx"
    )
    rows = read_xlsx(path)
    # Header at row index 2 (0-based), data from row 3
    data = [r[:19] for r in rows[3:] if len(r) > 2 and r[2].strip()]
    json.dump(data, sys.stdout)


if __name__ == "__main__":
    main()
