"""Draws pastel product illustrations (SVG) for menu items that don't have a real photo yet.
Run: python3 scripts/make-illustrations.py  → public/images/ai-*.svg
"""
import math, os

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'images')
CREAM, FOREST = '#fffaf2', '#20543f'


def frame(body, c1, c2, defs=''):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient>
<radialGradient id="shine" cx=".35" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
{defs}
</defs>
<rect width="800" height="800" fill="url(#bg)"/>
<circle cx="660" cy="130" r="150" fill="#fff" opacity=".35"/>
<circle cx="110" cy="690" r="120" fill="#fff" opacity=".25"/>
<circle cx="120" cy="140" r="16" fill="#ffec9d"/><circle cx="160" cy="110" r="10" fill="#ffdac1"/><circle cx="690" cy="640" r="12" fill="#a1d7c2"/>
{body}
</svg>'''


def plate(cy=600, rx=290, ry=58):
    return (f'<ellipse cx="400" cy="{cy+18}" rx="{rx}" ry="{ry}" fill="#20543f" opacity=".12" filter="url(#soft)"/>'
            f'<ellipse cx="400" cy="{cy}" rx="{rx}" ry="{ry}" fill="#fff"/>'
            f'<ellipse cx="400" cy="{cy-6}" rx="{rx-40}" ry="{ry-14}" fill="#f6f1e8"/>')


def flower(x, y, r, petal, centre='#ffec9d'):
    s = ''.join(f'<circle cx="{x + r*math.cos(a):.1f}" cy="{y + r*math.sin(a):.1f}" r="{r*0.75:.1f}" fill="{petal}"/>' for a in [i*2*math.pi/5 for i in range(5)])
    return s + f'<circle cx="{x}" cy="{y}" r="{r*0.55:.1f}" fill="{centre}"/>'


def drips(x0, x1, y, colour, seed=0):
    d = f'M{x0},{y} '
    x = x0
    i = seed
    while x < x1:
        w = 34 + (i * 7) % 18
        h = 22 + (i * 13) % 46
        d += f'L{x},{y} q{w/2},0 {w/2},{h} a{w/4},{w/4} 0 0 0 {w/2},0 q0,-{h} {0},-{h} '
        x += w
        i += 1
    d += f'L{x1},{y} L{x1},{y-20} L{x0},{y-20} Z'
    return f'<path d="{d}" fill="{colour}"/>'


def custom_cake():
    b = plate(640, 300, 60)
    b += '<rect x="400" y="606" width="0" height="0"/>'
    b += '<rect x="170" y="430" width="460" height="200" rx="26" fill="#ffebf4"/>'
    b += drips(170, 630, 440, '#ffffff', 1)
    b += '<rect x="250" y="270" width="300" height="170" rx="22" fill="#fffaf2"/>'
    b += drips(250, 550, 280, '#ffdac1', 3)
    b += '<rect x="170" y="600" width="460" height="16" rx="8" fill="#d98a9e" opacity=".5"/>'
    b += ''.join(f'<circle cx="{190+i*30}" cy="{612}" r="6" fill="#ffec9d"/>' for i in range(15))
    b += flower(300, 300, 26, '#d98a9e') + flower(350, 282, 18, '#ffffff') + flower(500, 296, 22, '#bfebef')
    b += flower(210, 470, 22, '#ffffff') + flower(590, 480, 26, '#d98a9e') + flower(560, 455, 16, '#ffec9d', '#fff')
    b += '<path d="M400 268 v-80" stroke="#20543f" stroke-width="6"/><path d="M400 150 c-30 -40 -80 0 0 50 c80 -50 30 -90 0 -50z" fill="#d98a9e"/>'
    b += '<path d="M330 360 h140" stroke="#a1d7c2" stroke-width="10" stroke-linecap="round"/>'
    return frame(b, '#ffebf4', '#ffdac1')


def squares(colour, topping, chunk, n=6, y0=430):
    s = ''
    pos = [(250, y0), (400, y0 - 20), (550, y0), (320, y0 + 70), (480, y0 + 70)][:n]
    for i, (x, y) in enumerate(pos):
        s += f'<rect x="{x-70}" y="{y-60}" width="140" height="120" rx="14" fill="{colour}" transform="rotate({(-6+i*4)} {x} {y})"/>'
        s += f'<rect x="{x-70}" y="{y-60}" width="140" height="38" rx="14" fill="{topping}" transform="rotate({(-6+i*4)} {x} {y})"/>'
        s += ''.join(f'<rect x="{x-50+j*28}" y="{y-10+(j%2)*26}" width="18" height="14" rx="4" fill="{chunk}" transform="rotate({j*20} {x} {y})"/>' for j in range(4))
    return s


def blondie():
    return frame(plate(600) + squares('#e8b86a', '#f3cf8a', '#fffaf2', 5), '#fff3c9', '#ffdac1')


def cookie(x, y, r, base='#d9a066', chip='#5a3e36'):
    s = f'<circle cx="{x}" cy="{y}" r="{r}" fill="{base}"/><circle cx="{x}" cy="{y}" r="{r}" fill="url(#shine)"/>'
    for i in range(7):
        a = i * 2.3
        s += f'<ellipse cx="{x + r*0.55*math.cos(a):.1f}" cy="{y + r*0.5*math.sin(a):.1f}" rx="{r*0.12:.1f}" ry="{r*0.09:.1f}" fill="{chip}"/>'
    s += f'<path d="M{x-r*0.5:.0f} {y-r*0.2:.0f} q{r*0.3:.0f} {r*0.15:.0f} {r*0.6:.0f} 0" stroke="#b9824b" stroke-width="5" fill="none"/>'
    return s


def cookie_box():
    b = '<rect x="160" y="300" width="480" height="340" rx="26" fill="#c9a274"/><rect x="180" y="320" width="440" height="300" rx="18" fill="#fffaf2"/>'
    b += cookie(290, 410, 78) + cookie(510, 410, 78, '#e0b07c') + cookie(290, 540, 78, '#cf9356') + cookie(510, 540, 78)
    b += '<path d="M160 300 l60 -90 h360 l60 90" fill="#dcbb8f"/><rect x="330" y="230" width="140" height="40" rx="20" fill="#a1d7c2"/>'
    return frame(b, '#eef8f3', '#ffdac1')


def ragi_puff():
    b = '<ellipse cx="400" cy="620" rx="250" ry="40" fill="#20543f" opacity=".12" filter="url(#soft)"/>'
    b += '<path d="M150 440 h500 c0 140 -110 200 -250 200 s-250 -60 -250 -200z" fill="#bfebef"/>'
    for i in range(46):
        x = 190 + (i * 53) % 420
        y = 440 - ((i * 37) % 110)
        b += f'<circle cx="{x}" cy="{y}" r="{20 + (i % 3)*4}" fill="{["#7a4f3a", "#8b5e44", "#5a3e36"][i % 3]}"/><circle cx="{x-6}" cy="{y-6}" r="6" fill="#fff" opacity=".25"/>'
    b += '<path d="M150 440 h500" stroke="#a1d7c2" stroke-width="14" stroke-linecap="round"/>'
    b += '<text x="400" y="560" text-anchor="middle" font-family="Georgia,serif" font-size="38" fill="#20543f">ragi</text>'
    return frame(b, '#eafeb4', '#bfebef')


def tart_crust(cx=400, cy=470, r=210, colour='#e3b06f'):
    pts = []
    for i in range(48):
        a = i * 2 * math.pi / 48
        rr = r + (12 if i % 2 else 0)
        pts.append(f'{cx + rr*math.cos(a):.1f},{cy + rr*0.55*math.sin(a):.1f}')
    return f'<polygon points="{" ".join(pts)}" fill="{colour}"/><ellipse cx="{cx}" cy="{cy+30}" rx="{r}" ry="{r*0.55}" fill="#c98f4e"/><polygon points="{" ".join(pts)}" fill="{colour}" transform="translate(0,-8)"/>'


def sweet_tart():
    b = plate(560, 300, 70) + tart_crust()
    b += '<ellipse cx="400" cy="455" rx="180" ry="92" fill="#fff3c9"/>'
    for i, (x, y, c) in enumerate([(330, 430, '#d9435e'), (380, 470, '#3b3f8f'), (440, 425, '#d9435e'), (470, 480, '#3b3f8f'), (350, 495, '#7fbf5a'), (420, 455, '#ffb347'), (300, 465, '#3b3f8f'), (500, 450, '#7fbf5a')]):
        b += f'<circle cx="{x}" cy="{y}" r="{22 if c != "#7fbf5a" else 26}" fill="{c}"/><circle cx="{x-7}" cy="{y-7}" r="6" fill="#fff" opacity=".5"/>'
    b += '<path d="M380 380 q20 -30 50 -10" stroke="#5a8f3a" stroke-width="8" fill="none"/>'
    return frame(b, '#ffebf4', '#fff3c9')


def savoury_tart():
    b = plate(560, 300, 70) + tart_crust(colour='#d9a35f')
    b += '<ellipse cx="400" cy="455" rx="180" ry="92" fill="#ffd36e"/>'
    for (x, y) in [(330, 440), (450, 430), (400, 490), (500, 470), (310, 480)]:
        b += f'<circle cx="{x}" cy="{y}" r="24" fill="#e2483d"/><circle cx="{x}" cy="{y}" r="14" fill="#ff7a6b"/>'
    for i in range(18):
        b += f'<ellipse cx="{300 + (i*41) % 210}" cy="{420 + (i*29) % 90}" rx="9" ry="4" fill="#4f9a45" transform="rotate({i*35} {300 + (i*41) % 210} {420 + (i*29) % 90})"/>'
    return frame(b, '#eafeb4', '#fff3c9')


def rocher_bomb():
    b = plate(600)
    for (x, s) in [(270, 0.8), (530, 0.8), (400, 1.0)]:
        y = 470 if s == 1 else 500
        r = 120 * s
        b += f'<path d="M{x-r*1.05:.0f} {y+r*0.55:.0f} l{r*0.25:.0f} -{r*0.45:.0f} l{r*0.3:.0f} {r*0.25:.0f} l{r*0.25:.0f} -{r*0.3:.0f} l{r*0.25:.0f} {r*0.3:.0f} l{r*0.3:.0f} -{r*0.25:.0f} l{r*0.25:.0f} {r*0.3:.0f} l{r*0.25:.0f} -{r*0.25:.0f} l{r*0.25:.0f} {r*0.45:.0f} z" fill="#e9c46a"/>'
        b += f'<circle cx="{x}" cy="{y}" r="{r:.0f}" fill="#6b4226"/><circle cx="{x}" cy="{y}" r="{r:.0f}" fill="url(#shine)"/>'
        for i in range(14):
            a = i * 0.9
            b += f'<rect x="{x + r*0.6*math.cos(a):.0f}" y="{y + r*0.6*math.sin(a):.0f}" width="{14*s:.0f}" height="{9*s:.0f}" rx="3" fill="#c9965a" transform="rotate({i*25} {x} {y})"/>'
        b += f'<circle cx="{x}" cy="{y - r*0.95:.0f}" r="{16*s:.0f}" fill="#c9965a"/>'
    return frame(b, '#ffec9d', '#ffdac1')


def shortbread():
    b = plate(600)
    for i, x in enumerate([260, 400, 540]):
        y = 470 + (i % 2) * 20
        t = f'rotate({(-8 + i*8)} {x} {y})'
        b += f'<g transform="{t}"><rect x="{x-60}" y="{y-20}" width="120" height="60" rx="8" fill="#f0d39a"/><rect x="{x-60}" y="{y-50}" width="120" height="34" rx="6" fill="#d38b3c"/><rect x="{x-62}" y="{y-80}" width="124" height="34" rx="10" fill="#5a3e36"/><path d="M{x-50} {y-70} q25 -10 50 0 t50 0" stroke="#7a5446" stroke-width="5" fill="none"/></g>'
    return frame(b, '#fff3c9', '#ffdac1')


def glass_layers(layers, top, x=400, y0=300, w=230, h=320):
    s = f'<ellipse cx="{x}" cy="{y0+h+10}" rx="{w*0.7}" ry="22" fill="#20543f" opacity=".12" filter="url(#soft)"/>'
    yy = y0 + h
    for colour, lh in layers:
        s += f'<rect x="{x-w/2+6}" y="{yy-lh}" width="{w-12}" height="{lh}" fill="{colour}"/>'
        yy -= lh
    s += top(x, yy, w)
    s += f'<path d="M{x-w/2} {y0} v{h} q0 18 18 18 h{w-36} q18 0 18 -18 v-{h}" fill="none" stroke="#ffffff" stroke-width="10" opacity=".9"/>'
    s += f'<rect x="{x-w/2+18}" y="{y0+20}" width="16" height="{h-60}" rx="8" fill="#fff" opacity=".45"/>'
    return s


def tiramisu():
    def top(x, y, w):
        return (f'<ellipse cx="{x}" cy="{y}" rx="{w/2-6}" ry="14" fill="#7a4f3a"/>'
                + ''.join(f'<circle cx="{x-80+i*20}" cy="{y-2 + (i%3)*3}" r="3" fill="#4b2e22"/>' for i in range(9))
                + f'<ellipse cx="{x+40}" cy="{y-14}" rx="16" ry="11" fill="#3b2418"/><path d="M{x+28} {y-14} q12 -4 24 0" stroke="#7a4f3a" stroke-width="3" fill="none"/>')
    b = glass_layers([('#c58a4e', 60), ('#fff3df', 70), ('#a86b3c', 50), ('#fff3df', 70), ('#7a4f3a', 30)], top)
    return frame(b, '#ffdac1', '#fffaf2')


def mud_pie():
    b = plate(600)
    b += '<path d="M220 520 L580 520 L470 330 Z" fill="#3f2a22"/>'
    b += '<path d="M220 520 L580 520 L580 560 L220 560 Z" fill="#b9824b"/>'
    b += '<path d="M220 520 L580 520 L470 330 Z" fill="#4b3128"/><path d="M220 520 L470 330 L520 380 L300 520 Z" fill="#5a3e36"/>'
    for i in range(6):
        b += f'<path d="M{300 + i*40} {470 - i*24} q20 -40 40 0 q20 -40 40 0" fill="#fffaf2" stroke="#f1e6d6" stroke-width="3"/>'
    b += '<circle cx="470" cy="320" r="18" fill="#d9435e"/><path d="M470 302 q10 -20 24 -24" stroke="#5a8f3a" stroke-width="4" fill="none"/>'
    return frame(b, '#ffdac1', '#ffebf4')


def pudding_bowl():
    def top(x, y, w):
        s = f'<ellipse cx="{x}" cy="{y}" rx="{w/2-6}" ry="14" fill="#fffaf2"/>'
        for i in range(5):
            s += f'<circle cx="{x-70+i*35}" cy="{y-6}" r="16" fill="#ffe8a3" stroke="#f0cf6a" stroke-width="3"/><circle cx="{x-70+i*35}" cy="{y-6}" r="4" fill="#c9a05a"/>'
        s += ''.join(f'<circle cx="{x-90+i*16}" cy="{y-20 - (i%3)*4}" r="5" fill="#b9824b"/>' for i in range(12))
        return s
    b = glass_layers([('#d4a373', 50), ('#fff3c9', 70), ('#ffe8a3', 40), ('#fff3c9', 60), ('#d4a373', 30)], top, w=300, h=260, y0=340)
    return frame(b, '#fff3c9', '#eafeb4')


def mochi():
    b = plate(600)
    for (x, c, d) in [(270, '#ffd1e0', '#f6a9c2'), (530, '#d7ecb4', '#a9cf7a'), (400, '#fffaf2', '#efe4d2')]:
        y = 500 if x != 400 else 470
        b += f'<ellipse cx="{x}" cy="{y}" rx="110" ry="90" fill="{c}"/><ellipse cx="{x}" cy="{y+40}" rx="110" ry="50" fill="{d}" opacity=".6"/>'
        b += f'<ellipse cx="{x-35}" cy="{y-35}" rx="30" ry="18" fill="#fff" opacity=".7"/>'
        b += ''.join(f'<circle cx="{x-60+i*15}" cy="{y-50 + (i%2)*10}" r="2.5" fill="#fff" opacity=".9"/>' for i in range(9))
    b += '<circle cx="400" cy="470" r="20" fill="#d9435e" opacity=".85"/>'
    return frame(b, '#ffebf4', '#eafeb4')


def korean_bun():
    b = plate(600)
    b += '<path d="M200 540 c0 -200 400 -200 400 0 z" fill="#e2a65c"/><path d="M200 540 c0 -200 400 -200 400 0 z" fill="url(#shine)"/>'
    b += '<path d="M400 360 L400 540 M280 450 L520 450" stroke="#fffaf2" stroke-width="28" stroke-linecap="round"/>'
    b += '<path d="M400 360 L400 540 M280 450 L520 450" stroke="#fff3df" stroke-width="16" stroke-linecap="round"/>'
    for i in range(22):
        b += f'<ellipse cx="{240 + (i*37) % 330}" cy="{410 + (i*23) % 110}" rx="7" ry="3.5" fill="#3f8f3a" transform="rotate({i*30} {240 + (i*37) % 330} {410 + (i*23) % 110})"/>'
    b += '<path d="M220 540 h360" stroke="#c98a3e" stroke-width="10" stroke-linecap="round"/>'
    return frame(b, '#fff3c9', '#eef8f3')


def bundt():
    b = plate(600)
    b += '<ellipse cx="400" cy="500" rx="230" ry="100" fill="#b9824b"/>'
    for i in range(16):
        x = 190 + i * 28
        b += f'<path d="M{x} 500 q14 -150 28 0" fill="#d4a373" stroke="#b9824b" stroke-width="3"/>'
    b += '<ellipse cx="400" cy="400" rx="210" ry="80" fill="#e3b77e"/>'
    b += '<ellipse cx="400" cy="395" rx="200" ry="70" fill="#fffaf2"/>'
    b += drips(210, 590, 420, '#fffaf2', 2)
    b += '<ellipse cx="400" cy="395" rx="60" ry="24" fill="#c98f4e"/>'
    b += ''.join(f'<circle cx="{260 + i*30}" cy="{380 + (i%3)*8}" r="5" fill="{["#d9435e", "#3b3f8f", "#f0b429"][i%3]}"/>' for i in range(10))
    return frame(b, '#ffdac1', '#fff3c9')


def cinnamon_rolls():
    b = plate(600)
    for (x, y, r) in [(280, 500, 95), (520, 500, 95), (400, 420, 105)]:
        b += f'<circle cx="{x}" cy="{y}" r="{r}" fill="#d38b3c"/>'
        d = f'M{x} {y} '
        for k in range(1, 40):
            a = k * 0.45
            rr = r * k / 40
            d += f'L{x + rr*math.cos(a):.1f} {y + rr*math.sin(a):.1f} '
        b += f'<path d="{d}" stroke="#8a4b1c" stroke-width="7" fill="none" stroke-linecap="round"/>'
        b += f'<path d="M{x-r*0.8:.0f} {y-r*0.2:.0f} q{r*0.4:.0f} {r*0.3:.0f} {r*0.8:.0f} 0 t{r*0.8:.0f} 0" stroke="#fffaf2" stroke-width="12" fill="none" stroke-linecap="round"/>'
    return frame(b, '#ffec9d', '#ffebf4')


def protein():
    b = plate(600)
    b += squares('#4b3128', '#5a3e36', '#d9a066', 2, 480).replace('rotate(-6 250 480)', 'rotate(-6 300 480)')
    b += cookie(530, 470, 90, '#c78f55', '#3f2a22')
    b += '<rect x="310" y="300" width="180" height="56" rx="28" fill="#a1d7c2"/><text x="400" y="338" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="30" fill="#20543f">PROTEIN</text>'
    return frame(b, '#eef8f3', '#eafeb4')


def granola():
    b = '<ellipse cx="400" cy="640" rx="220" ry="30" fill="#20543f" opacity=".12" filter="url(#soft)"/>'
    b += '<rect x="250" y="240" width="300" height="400" rx="40" fill="#ffffff" opacity=".85"/>'
    b += '<rect x="240" y="200" width="320" height="60" rx="16" fill="#a1d7c2"/>'
    for i in range(70):
        x = 275 + (i * 47) % 250
        y = 300 + (i * 31) % 320
        c = ['#c9965a', '#b9824b', '#e3b77e', '#7a4f3a', '#d9435e'][i % 5]
        b += f'<ellipse cx="{x}" cy="{y}" rx="{10 + (i%3)*4}" ry="{8 + (i%2)*3}" fill="{c}" transform="rotate({i*17} {x} {y})"/>'
    b += '<rect x="290" y="420" width="220" height="90" rx="12" fill="#fffaf2"/><text x="400" y="478" text-anchor="middle" font-family="Georgia,serif" font-size="40" fill="#20543f">granola</text>'
    return frame(b, '#fff3c9', '#eafeb4')


ITEMS = {
    'ai-custom-cake': custom_cake, 'ai-blondies': blondie, 'ai-cookie-box': cookie_box, 'ai-ragi-puff': ragi_puff,
    'ai-sweet-tart': sweet_tart, 'ai-savoury-tart': savoury_tart, 'ai-rocher-bomb': rocher_bomb, 'ai-shortbread': shortbread,
    'ai-tiramisu': tiramisu, 'ai-mud-pie': mud_pie, 'ai-pudding-bowl': pudding_bowl, 'ai-mochi': mochi,
    'ai-korean-bun': korean_bun, 'ai-bundt': bundt, 'ai-cinnamon-rolls': cinnamon_rolls, 'ai-protein': protein, 'ai-granola': granola,
}

if __name__ == '__main__':
    for name, fn in ITEMS.items():
        with open(os.path.join(OUT, name + '.svg'), 'w') as f:
            f.write(fn())
    print('wrote', len(ITEMS), 'illustrations')
