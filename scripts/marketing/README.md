# Marketing assets

## Title cards

Animated text cards for the launch video: linen, stitched hem, Lora text that fades up, then a red running stitch sews in under it (plus a small gold cross-stitch). 3s, 30fps, H.264 yuv420p, no audio, `+faststart`. Fully offline (self-hosted Lora + linen texture).

- Template: `scripts/marketing/titlecard.html`. Query params: `text`, `w`, `h`, `theme` (light|dark), `size` (px at 1080 short edge, auto-shrinks to fit), `maxw` (fraction of width), `lines` (max, default 3), `accent` (0 to drop the cross). Open it in a browser to preview.
- Renderer: `scripts/marketing/titlecards.ts`. Edit `CARDS` to add or change cards. Frames are exact: all CSS animations are paused and seeked to `i/30`, screenshotted, piped to ffmpeg.
- Sizes: 1080x1920 (9:16) and 1920x1080 (16:9).
- Output: `marketing/out/titlecards/<slug>-<theme>-<WxH>.mp4`.

```sh
bun scripts/marketing/titlecards.ts              # all cards, both sizes (~5 min)
bun scripts/marketing/titlecards.ts --only url   # slug filter
```

Timeline: text in 0.25-1.2s, stitches 1.05-2.05s, cross 2.15s, hold, fade out 2.55-3.0s.
