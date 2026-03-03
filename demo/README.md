# demo

The video clip demo.gif was produced from an .mp4 file which you can download raw and play on your own system.

The .gif came from the .mp4 via
```
ffmpeg -i overview_final.mp4 -vf "fps=10,scale=1000:-1:flags=lanczos" demo.gif
```


