#!/usr/bin/env python3
"""
BranchChat branded card generator.

Renders a 1080x1080 social card in brand colors with the tree-brain logo.
Used by the content pipeline to attach an image to text/hook posts.

Usage:
  python3 generate_card.py --type hook  --text "ChatGPT is a transcript." \\
        --text2 "BranchChat is a thinking canvas." --out card.png
  python3 generate_card.py --type quote --text "Real thinking forks. Your chat should too." --out card.png
  python3 generate_card.py --type stat  --text "3x" --text2 "more prompt variants compared, side by side" --out card.png

Templates:
  hook  -> two contrasting lines (muted line + ink line)  [great for "X vs BranchChat"]
  quote -> one bold statement centered                    [great for takes/one-liners]
  stat  -> big number/word + supporting label             [great for data/feature posts]

Defaults: footer shows the tagline + branch-chat.com, header shows logo + @branchchathq.
Run on the Linux sandbox (fonts below are sandbox paths).
"""
import argparse, os

from PIL import Image, ImageDraw, ImageFont

INK="#0A0A0A"; MUTE="#6B6B6B"; ACCENT="#5B4FE6"; BG="#FFFFFF"; LINE="#E7E7E3"
HERE=os.path.dirname(os.path.abspath(__file__))
LOGO=os.path.join(HERE,"brand-mark.png")

SB="/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"
SR="/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
MB="/usr/share/fonts/truetype/liberation2/LiberationMono-Bold.ttf"
W=H=1080
MARGIN=80

def font(p,s): return ImageFont.truetype(p,s)

def wrap(d,text,fo,maxw):
    out=[]
    for para in text.split("\n"):
        words=para.split(); cur=""
        for w in words:
            t=(cur+" "+w).strip()
            if d.textlength(t,font=fo)<=maxw: cur=t
            else:
                if cur: out.append(cur)
                cur=w
        out.append(cur)
    return out

def fit(d,text,path,maxw,start,minsize=44):
    """Shrink font until the longest wrapped line fits."""
    s=start
    while s>minsize:
        fo=font(path,s)
        if all(d.textlength(l,font=fo)<=maxw for l in wrap(d,text,fo,maxw)):
            return fo,s
        s-=4
    return font(path,minsize),minsize

def header(img,d):
    if os.path.exists(LOGO):
        logo=Image.open(LOGO).convert("RGBA"); logo.thumbnail((84,84))
        img.paste(logo,(MARGIN,90),logo); tx=MARGIN+104
    else: tx=MARGIN
    d.text((tx,104),"BranchChat",font=font(SB,40),fill=INK)
    d.text((tx,150),"@branchchathq",font=font(SR,24),fill=MUTE)

def footer(d,tagline="Branch from any message. Compare. Link context."):
    d.line([MARGIN,H-150,W-MARGIN,H-150],fill=LINE,width=2)
    d.text((MARGIN,H-120),tagline,font=font(SR,30),fill=MUTE)
    d.text((MARGIN,H-78),"branch-chat.com",font=font(MB,30),fill=ACCENT)

def accent_bar(d):
    d.rectangle([MARGIN,H-150-46,MARGIN+70,H-150-36],fill=ACCENT)

def render(kind,text,text2,out):
    img=Image.new("RGB",(W,H),BG); d=ImageDraw.Draw(img)
    header(img,d)
    maxw=W-2*MARGIN
    if kind=="hook":
        fo,sz=fit(d,max([text,text2 or ""],key=len),SB,maxw,84)
        lines=wrap(d,text,fo,maxw)+["__GAP__"]+wrap(d,text2 or "",fo,maxw)
        total=sum((24 if l=="__GAP__" else int(sz*1.17)) for l in lines)
        y=(H-total)//2-40
        first=True
        for l in lines:
            if l=="__GAP__": y+=24; first=False; continue
            d.text((MARGIN,y),l,font=fo,fill=MUTE if first else INK); y+=int(sz*1.17)
    elif kind=="stat":
        fo=font(SB,300);
        while d.textlength(text,font=fo)>maxw and fo.size>120: fo=font(SB,fo.size-10)
        d.text((MARGIN,300),text,font=fo,fill=ACCENT)
        sub=font(SR,46)
        y=300+fo.size+20
        for l in wrap(d,text2 or "",sub,maxw): d.text((MARGIN,y),l,font=sub,fill=INK); y+=58
    else:  # quote
        fo,sz=fit(d,text,SB,maxw,90)
        lines=wrap(d,text,fo,maxw)
        total=len(lines)*int(sz*1.18); y=(H-total)//2-30
        for l in lines: d.text((MARGIN,y),l,font=fo,fill=INK); y+=int(sz*1.18)
    accent_bar(d); footer(d)
    img.save(out); return out

if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("--type",default="quote",choices=["hook","quote","stat"])
    ap.add_argument("--text",required=True)
    ap.add_argument("--text2",default="")
    ap.add_argument("--out",required=True)
    a=ap.parse_args()
    print(render(a.type,a.text,a.text2,a.out))
