#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate KroomDrive banner PNG for GitHub README.
Requires: pip install Pillow
Run from project root: python scripts/make_banner.py
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT_DIR = Path(__file__).parent.parent / "public"
OUT_DIR.mkdir(exist_ok=True)

W, H = 1200, 400

# ─── Colors ───────────────────────────────────────────────────────────────────
BG1      = (15,  15,  26)
BG2      = (26,  16,  53)
PURPLE   = (67,  24, 255)
PURPLE_L = (123, 92, 255)
WHITE    = (255, 255, 255)
WHITE55  = (255, 255, 255, 140)
WHITE30  = (255, 255, 255, 77)
PILL_BG  = (67,  24, 255, 50)
ORANGE   = (249, 115, 22)


def lerp_color(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def draw_rounded_rect(draw, x0, y0, x1, y1, r, fill):
    draw.rectangle([x0 + r, y0, x1 - r, y1], fill=fill)
    draw.rectangle([x0, y0 + r, x1, y1 - r], fill=fill)
    draw.ellipse([x0, y0, x0 + 2*r, y0 + 2*r], fill=fill)
    draw.ellipse([x1 - 2*r, y0, x1, y0 + 2*r], fill=fill)
    draw.ellipse([x0, y1 - 2*r, x0 + 2*r, y1], fill=fill)
    draw.ellipse([x1 - 2*r, y1 - 2*r, x1, y1], fill=fill)


def draw_kroom_logo(img: Image.Image, ox, oy, size):
    """Draw the KroomDrive logo (K shape from Icons.tsx) at position ox,oy with given size."""
    # Scale: viewBox is 100x80
    sx = size / 100
    sy = (size * 0.8) / 80  # maintain 100:80 aspect

    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)

    # Left body: rounded rect 0,0,45,80 rx=22.5
    lw = int(45 * sx)
    lh = int(80 * sy)
    lr = int(22.5 * min(sx, sy))
    draw_rounded_rect(d, ox, oy, ox + lw, oy + lh, lr, (*PURPLE, 255))

    # Eye hole (punch out circle at 18,40 r=4)
    ex = ox + int(18 * sx)
    ey = oy + int(40 * sy)
    er = max(2, int(4 * min(sx, sy)))
    d.ellipse([ex - er, ey - er, ex + er, ey + er], fill=(*BG1, 255))

    # Top right wing: M55 36V0H100C100 0 100 36 55 36Z
    # Bezier approximated as a polygon
    wx = ox + int(55 * sx)
    wy_top = oy + int(36 * sy)
    wr = ox + int(100 * sx)
    pts_top = [
        (wx, wy_top),
        (wx, oy),
        (wr, oy),
        (wr, wy_top),
        (wx, wy_top),
    ]
    d.polygon(pts_top, fill=(*PURPLE, 255))

    # Bottom right wing: M55 44V80H100C100 80 100 44 55 44Z
    wy_bot_start = oy + int(44 * sy)
    wy_bot_end   = oy + int(80 * sy)
    pts_bot = [
        (wx, wy_bot_start),
        (wx, wy_bot_end),
        (wr, wy_bot_end),
        (wr, wy_bot_start),
        (wx, wy_bot_start),
    ]
    d.polygon(pts_bot, fill=(*PURPLE, 255))

    # Blend with glow
    glow = overlay.copy()
    glow = glow.filter(ImageFilter.GaussianBlur(radius=18))
    img.paste(glow, (0, 0), glow)
    img.paste(overlay, (0, 0), overlay)


def make_banner():
    # Base image with gradient background
    img = Image.new("RGBA", (W, H), BG1)
    d = ImageDraw.Draw(img)

    # Gradient background (manual row-by-row)
    for y in range(H):
        t = y / H
        color = lerp_color(BG1, BG2, t)
        d.line([(0, y), (W, y)], fill=(*color, 255))

    # Glow blobs
    blob_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(blob_layer)
    bd.ellipse([120 - 180, 200 - 180, 120 + 180, 200 + 180], fill=(*PURPLE, 20))
    bd.ellipse([1100 - 150, 100 - 150, 1100 + 150, 100 + 150], fill=(*PURPLE_L, 15))
    bd.ellipse([650 - 120, 350 - 120, 650 + 120, 350 + 120], fill=(*PURPLE, 13))
    blob_layer = blob_layer.filter(ImageFilter.GaussianBlur(radius=60))
    img = Image.alpha_composite(img, blob_layer)

    # Subtle grid lines
    d2 = ImageDraw.Draw(img)
    grid_color = (*WHITE, 10)
    for x in range(0, W, 200):
        d2.line([(x, 0), (x, H)], fill=grid_color)
    for y in range(0, H, 100):
        d2.line([(0, y), (W, y)], fill=grid_color)

    # Accent bar at top
    for x in range(W):
        t = x / W
        c = lerp_color(PURPLE, PURPLE_L, t)
        d2.line([(x, 0), (x, 3)], fill=(*c, 255))

    # ── Logo ──────────────────────────────────────────────────────────────────
    LOGO_SIZE = 150
    draw_kroom_logo(img, 110, H // 2 - int(LOGO_SIZE * 0.4), LOGO_SIZE)

    # ── Text (wordmark + tagline) ─────────────────────────────────────────────
    d3 = ImageDraw.Draw(img)

    # Try to load a bold font; fall back to default
    try:
        from PIL import ImageFont
        # Try common system fonts
        font_paths = [
            "C:/Windows/Fonts/arialbd.ttf",      # Windows
            "C:/Windows/Fonts/segoeui.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",  # Linux
            "/System/Library/Fonts/Helvetica.ttc",  # macOS
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        ]
        font_title = None
        font_small = None
        for fp in font_paths:
            if Path(fp).exists():
                font_title  = ImageFont.truetype(fp, 72)
                font_sub    = ImageFont.truetype(fp, 22)
                font_small  = ImageFont.truetype(fp, 14)
                font_pill   = ImageFont.truetype(fp, 13)
                break
        if not font_title:
            font_title = ImageFont.load_default()
            font_sub   = font_title
            font_small = font_title
            font_pill  = font_title
    except Exception:
        font_title = None

    tx = 390
    # "KroomDrive"
    if font_title:
        d3.text((tx, 140), "Kroom", font=font_title, fill=(*WHITE, 230))
        kroom_w = font_title.getlength("Kroom")
        d3.text((tx + kroom_w, 140), "Drive", font=font_title, fill=(*PURPLE_L, 255))
    else:
        d3.text((tx, 160), "KroomDrive", fill=(*WHITE, 230))

    # Tagline
    if font_sub:
        d3.text((tx + 2, 230), "Self-hosted · Multi-user · SSH File Manager",
                font=font_sub, fill=(*WHITE, 130))

    # Pills row
    PILLS = [
        ("SSH / SFTP",  PURPLE,  0),
        ("Git Panel",   PURPLE,  125),
        ("Multi-User",  PURPLE,  215),
        ("CF Tunnel",   ORANGE,  340),
    ]
    py = 275
    ph = 32
    for label, color, px in PILLS:
        abs_px = tx + 2 + px
        pw = len(label) * 9 + 24
        # Pill background
        pill_bg = Image.new("RGBA", img.size, (0, 0, 0, 0))
        pb = ImageDraw.Draw(pill_bg)
        draw_rounded_rect(pb, abs_px, py, abs_px + pw, py + ph,
                          ph // 2, (*color, 45))
        img = Image.alpha_composite(img, pill_bg)
        # Pill border
        bd2 = ImageDraw.Draw(img)
        draw_rounded_rect(bd2, abs_px, py, abs_px + pw, py + ph, ph // 2, (0, 0, 0, 0))
        for i in range(2):
            draw_rounded_rect(bd2, abs_px + i, py + i, abs_px + pw - i, py + ph - i,
                              ph // 2 - i, (*color, 100 - i * 30))
        # Label
        if font_pill:
            lw = font_pill.getlength(label)
            cx = abs_px + (pw - lw) // 2
            ImageDraw.Draw(img).text((cx, py + 8), label, font=font_pill,
                                     fill=(*lerp_color(color, WHITE, 0.6), 220))

    # KroomBox branding bottom right
    if font_small:
        br_text = "by KroomBox · kroombox.com"
        bw = font_small.getlength(br_text)
        ImageDraw.Draw(img).text((W - bw - 20, H - 30), br_text,
                                  font=font_small, fill=(*WHITE, 70))

    # Convert to RGB for PNG save
    final = img.convert("RGB")
    out_banner = OUT_DIR / "banner.png"
    final.save(out_banner, "PNG", optimize=True)
    print(f"✓ Banner saved: {out_banner}  ({W}x{H}px)")

    # Small logo PNG
    logo_size = 200
    logo_img = Image.new("RGBA", (logo_size, int(logo_size * 0.8)), (0, 0, 0, 0))
    draw_kroom_logo(logo_img, 0, 0, logo_size)
    logo_rgb = logo_img.convert("RGBA")
    out_logo = OUT_DIR / "logo.png"
    logo_rgb.save(out_logo, "PNG", optimize=True)
    print(f"✓ Logo saved:   {out_logo}  ({logo_size}x{int(logo_size*0.8)}px)")


if __name__ == "__main__":
    make_banner()
    print("\nDone! Commit public/banner.png and public/logo.png to GitHub.")
