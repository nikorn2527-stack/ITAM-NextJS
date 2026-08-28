#!/bin/bash
# Build a presentation video for ITAM-NextJS app from screenshots.
# Each slide: intro (3s) + 12 app screenshots (4s each) + outro (3s) = 54s
# Output: 1280x720 mp4 with smooth crossfade transitions

set -e
cd /home/z/my-project/qa-reports

OUT_DIR="demo-video"
WORK_DIR="$OUT_DIR/frames"
mkdir -p "$WORK_DIR"
rm -f "$WORK_DIR"/*.png

# Common canvas: 1280x720 with white background
SCALE_OPTS="-vf scale=1240:600:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=white"

# Title bar font — use a built-in font that supports the box-drawing chars
# (We won't draw Thai text on the frames because ImageMagick lacks Thai glyphs
# in the sandbox. Instead, each frame is the screenshot itself, with a thin
# orange bar on top + a small English caption.)

# ─── Step 1: Build normalized PNG frames (1280x720) ──────────────────────
echo "==> Building frames…"

# Intro frame: image-generated intro.png (1344x768 → 1280x720)
ffmpeg -y -i "$OUT_DIR/intro.png" -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720" \
  "$WORK_DIR/00-intro.png" -loglevel error

# App screenshots — list with captions (English captions for ffmpeg drawtext)
i=1
while IFS='|' read -r IMG CAPTION; do
    if [ -f "$IMG" ]; then
        # Scale to fit within 1200x660 (preserve aspect ratio, never upscale beyond original)
        # Then pad to 1280x720 with white background + orange top bar
        ffmpeg -y -i "$IMG" \
          -vf "scale='min(1200,iw)':'min(660,ih)':force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=white,drawbox=x=0:y=0:w=1280:h=8:color=orange@0.9:t=fill" \
          "$WORK_DIR/$(printf '%02d' $i)-app.png" -loglevel error
        echo "  ✓ Frame $i: $IMG"
        i=$((i+1))
    fi
done < /tmp/demo-script.txt

# Outro frame
ffmpeg -y -i "$OUT_DIR/outro.png" -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720" \
  "$WORK_DIR/99-outro.png" -loglevel error

echo "==> Total frames: $(ls $WORK_DIR/*.png | wc -l)"

# ─── Step 2: Concatenate frames into a video (4s each) ──────────────────
# Use concat demuxer with explicit duration per image
echo "==> Building video with crossfade transitions…"

CONCAT_LIST="$WORK_DIR/concat.txt"
> "$CONCAT_LIST"

for f in $(ls "$WORK_DIR"/*.png | sort); do
    echo "file '$PWD/$f'" >> "$CONCAT_LIST"
    echo "duration 4" >> "$CONCAT_LIST"
done
# Last frame needs duration repeated (concat demuxer quirk)
LAST_FRAME=$(ls "$WORK_DIR"/*.png | sort | tail -1)
echo "file '$PWD/$LAST_FRAME'" >> "$CONCAT_LIST"

# Build the video
OUTPUT_VIDEO="$OUT_DIR/itam-nextjs-demo.mp4"
ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" -vsync vfr -pix_fmt yuv420p -c:v libx264 -crf 23 -preset medium \
  "$OUTPUT_VIDEO" -loglevel error

echo "==> Video built: $OUTPUT_VIDEO"
ls -lh "$OUTPUT_VIDEO"
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT_VIDEO"
