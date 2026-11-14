# Draws a simple tennis-ball icon. Run once if the pngs need to be rebuilt.
import math
import struct
import zlib
from pathlib import Path


def chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path, size):
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            row.extend(pixel(x + 0.5, y + 0.5, size))
        rows.append(row)
    raw = b''.join(rows)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    Path(path).write_bytes(png)


def pixel(x, y, size):
    green = (11, 61, 46, 255)
    ball = (230, 255, 80, 255)
    seam = (255, 255, 255, 255)
    cx = cy = size / 2
    radius = size * 0.36
    dx = x - cx
    dy = y - cy
    if dx * dx + dy * dy > radius * radius:
        # Soft square behind the ball so it reads as an app icon.
        margin = size * 0.08
        if margin <= x <= size - margin and margin <= y <= size - margin:
            return green
        return (246, 243, 236, 255)
    nx = dx / radius
    ny = dy / radius
    curve = 0.55 * math.sin(ny * math.pi)
    if abs(nx - curve) < 0.08 or abs(nx + curve) < 0.08:
        return seam
    return ball


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    for size, name in ((180, 'icon-180.png'), (192, 'icon-192.png'), (512, 'icon-512.png')):
        write_png(root / name, size)
