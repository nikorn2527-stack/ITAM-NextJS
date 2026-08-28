#!/bin/bash
# Build a presentation video for ITAM-NextJS with smooth crossfade transitions
# and Thai captions rendered via ImageMagick (if Thai font available) or
# burned-in caption bar at bottom.
#
# Output: 1280x720 mp4, ~60s, with 1s crossfades between slides

set -e
cd /home/z/my-project/qa-reports

OUT_DIR="demo-video"
WORK_DIR="$OUT_DIR/frames-v2"
mkdir -p "$WORK_DIR"
rm -f "$WORK_DIR"/*.png

# ─── Find a font that supports Thai ─────────────────────────────────────
THAI_FONT=""
for f in \
  /usr/share/fonts/opentype/tlwg/Loma.otf \
  /usr/share/fonts/opentype/tlwg/Loma-Bold.otf \
  /usr/share/fonts/truetype/tlwg/Loma.ttf \
  /usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf \
  /usr/share/fonts/opentype/noto/NotoSansThai-Regular.otf
do
    if [ -f "$f" ]; then
        THAI_FONT="$f"
        break
    fi
done

if [ -z "$THAI_FONT" ]; then
    # Try fc-list for any Thai font
    THAI_FONT=$(fc-list :lang=th | head -1 | cut -d: -f1)
fi

echo "==> Thai font: ${THAI_FONT:-(none — Thai captions will be skipped)}"

# ─── Build individual slide PNGs with caption bar ──────────────────────
echo "==> Building slide frames…"

# Intro slide — generated image + title overlay
ffmpeg -y -i "$OUT_DIR/intro.png" \
  -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,drawbox=x=0:y=600:w=1280:h=120:color=black@0.7:t=fill$([ -n "$THAI_FONT" ] && echo ",drawtext=fontfile=$THAI_FONT:text='ITAM-NextJS — ระบบจัดการสินทรัพย์ไอที':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=650")" \
  "$WORK_DIR/00-intro.png" -loglevel error
echo "  ✓ Intro"

# App slides — each with screenshot + bottom caption bar
i=1
while IFS='|' read -r IMG CAPTION; do
    if [ -f "$IMG" ]; then
        # Escape caption for ffmpeg drawtext (replace special chars)
        ESC_CAPTION=$(echo "$CAPTION" | sed "s/'/\\\\\\\\'/g" | sed "s/:/\\\\:/g")
        # All frames must be 1280x720 — pad to canvas size first, then overlay caption
        ffmpeg -y -i "$IMG" \
          -vf "scale='min(1200,iw)':'min(580,ih)':force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:30:color=white,drawbox=x=0:y=0:w=1280:h=8:color=orange@0.9:t=fill,drawbox=x=0:y=600:w=1280:h=120:color=black@0.75:t=fill$([ -n "$THAI_FONT" ] && echo ",drawtext=fontfile=$THAI_FONT:text='$ESC_CAPTION':fontcolor=white:fontsize=24:x=(w-text_w)/2:y=645")" \
          "$WORK_DIR/$(printf '%02d' $i)-app.png" -loglevel error
        echo "  ✓ Slide $i: $IMG"
        i=$((i+1))
    fi
done < /tmp/demo-script.txt

# Outro slide
ffmpeg -y -i "$OUT_DIR/outro.png" \
  -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,drawbox=x=0:y=600:w=1280:h=120:color=black@0.7:t=fill$([ -n "$THAI_FONT" ] && echo ",drawtext=fontfile=$THAI_FONT:text='ขอบคุณที่รับชม — ITAM-NextJS':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=650")" \
  "$WORK_DIR/99-outro.png" -loglevel error
echo "  ✓ Outro"

TOTAL_SLIDES=$(ls "$WORK_DIR"/*.png | wc -l)
echo "==> Total slides: $TOTAL_SLIDES"

# ─── Build video with xfade transitions ─────────────────────────────────
echo "==> Building video with crossfade transitions…"

# For N slides, each visible for 4s with 1s xfade overlap:
# Total duration ≈ N*4 - (N-1)*1 = 3N+1 seconds
SLIDE_DUR=4
XFADE_DUR=1

OUTPUT_VIDEO="$OUT_DIR/itam-nextjs-demo-v2.mp4"

# Build concat list with xfade using complex filter
SLIDES=($(ls "$WORK_DIR"/*.png | sort))
NUM_SLIDES=${#SLIDES[@]}

# Each input: -loop 1 -t DURATION -i FRAME
INPUT_ARGS=""
for s in "${SLIDES[@]}"; do
    INPUT_ARGS="$INPUT_ARGS -loop 1 -t $SLIDE_DUR -i $PWD/$s"
done

# Build filter graph with xfade between consecutive slides
FILTER=""
OFFSET=0
for ((i=0; i<NUM_SLIDES; i++)); do
    if [ $i -eq 0 ]; then
        FILTER="[0:v]format=yuv420p[s0]"
    else
        # xfade from accumulated [s_prev] to current [i:v]
        OFFSET=$((OFFSET + SLIDE_DUR - XFADE_DUR))
        FILTER="$FILTER;[s$((i-1))][$i:v]xfade=transition=fade:duration=$XFADE_DUR:offset=$OFFSET[s$i]"
    fi
done

# Final output label is s$((NUM_SLIDES-1))
FINAL_LABEL="s$((NUM_SLIDES-1))"
FILTER="$FILTER;[$FINAL_LABEL]format=yuv420p[out]"

# Calculate total duration
TOTAL_DUR=$((NUM_SLIDES * SLIDE_DUR - (NUM_SLIDES - 1) * XFADE_DUR))
echo "==> Expected duration: ${TOTAL_DUR}s"

ffmpeg -y $INPUT_ARGS \
  -filter_complex "$FILTER" \
  -map "[out]" \
  -c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p \
  -r 30 \
  "$OUTPUT_VIDEO" -loglevel error

echo "==> Video built: $OUTPUT_VIDEO"
ls -lh "$OUTPUT_VIDEO"
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT_VIDEO"
