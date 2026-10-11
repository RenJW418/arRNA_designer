"""Copy Figure 4 panels from the fixed Nature Protocols PDF into website assets.

The final PDF embeds Figure 4 as a raster image. Preserve those original pixels;
the SVG files are image containers, not reconstructed scientific illustrations.
Run with a Python runtime providing pypdf and Pillow.
"""
from base64 import b64encode
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "NatureProtocol/final/20180_1_art_file_302613_tm8fj0.pdf"
ASSETS = ROOT / "frontend/public/figures"
figure = PdfReader(SOURCE).pages[36].images[0].image
assert figure.size == (1259, 1735), "Final Figure 4 changed; inspect panel bounds before copying."
panels = {
    "leaper3-universal-design": (0, 0, 1259, 518),
    "leaper3-custom-design": (0, 521, 1259, 1336),
    "leaper-exon-skipping-design": (0, 1342, 1259, 1735),
}
for name, bounds in panels.items():
    panel = figure.crop(bounds)
    buffer = BytesIO()
    panel.save(buffer, format="PNG")
    data = buffer.getvalue()
    (ASSETS / f"{name}.png").write_bytes(data)
    width, height = panel.size
    encoded = b64encode(data).decode("ascii")
    (ASSETS / f"{name}.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}"><title>Nature Protocols final Figure 4</title>'
        f'<image width="{width}" height="{height}" href="data:image/png;base64,{encoded}"/></svg>\n',
        encoding="utf-8",
    )
    print(f"{name}: {width} x {height}")
