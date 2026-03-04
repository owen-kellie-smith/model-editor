# Python scripts

1. [Load an XML model](../../../README.md#how-to-run)

2. Export as Python, which creates, say model.py in your Downloads folder. From the command line in your Downloads folder see what command line arguments are available in the Python script 
```bash
python3 model.py --help
which returns something like
```bash
usage: annuity-model.py [-h] [--steps STEPS] [--csv CSV] [--index INDEX] [--strict] [--plot-traj | --plot-static] [--gif GIF] [--fps FPS] [--dpi DPI]
                        [--plot-vars PLOT_VARS] [--plot-t PLOT_T] [--plot-title PLOT_TITLE] [--plot-step PLOT_STEP] [--plot-point]
                        [--plot-head-color PLOT_HEAD_COLOR] [--plot-tail-color PLOT_TAIL_COLOR] [--plot-head-colors PLOT_HEAD_COLORS]
                        [--plot-tail-colors PLOT_TAIL_COLORS] [--no-model-id-title]

Run exported model

options:
  -h, --help            show this help message and exit
  --steps STEPS         temporal max (inclusive)
  --csv CSV             Output CSV path (default: <model_id>_out.csv)
  --index INDEX         Override index values: --index cohort=1,2 or --index day_type=weekday,weekend
  --strict              Fail fast on evaluation errors (instead of returning NaN)
  --plot-traj           Generate an animated trajectory GIF after computing results (requires --plot-vars)
  --plot-static         Generate a single-frame (static) trajectory GIF after computing results (requires --plot-vars)
  --gif GIF             GIF output path (default: <model_id>.gif; only used with --plot-traj/--plot-static)
  --fps FPS             Frames per second for animated GIF (only used with --plot-traj)
  --dpi DPI             DPI for GIF rendering
  --plot-vars PLOT_VARS
                        Plot specification(s). Format: label:x[,y[,z]];label2:x[,y[,z]]. (1D uses t vs x; 2D uses x,y; 3D uses x,y,z).
  --plot-t PLOT_T       Temporal column to animate over for --plot-vars (defaults to temporal index).
  --plot-title PLOT_TITLE
                        Column to display in the plot title (defaults to --plot-t).
  --plot-step PLOT_STEP
                        Frame stride for --plot-traj (use >1 to reduce frames).
  --plot-point          Draw only the moving point (not the whole tail).
  --plot-head-color PLOT_HEAD_COLOR
                        Default head color for plotted trajectories.
  --plot-tail-color PLOT_TAIL_COLOR
                        Default tail color for plotted trajectories.
  --plot-head-colors PLOT_HEAD_COLORS
                        Per-trajectory head colors: label=color,label2=color
  --plot-tail-colors PLOT_TAIL_COLORS
                        Per-trajectory tail colors: label=color,label2=color
  --no-model-id-title   Suppress model id in plot title (saves space)
```
```
## Example Python command lines and output
### Run with embedded sample inputs (referring to no other files)
#### Running all cohorts and sending output to standard filenames

```bash
python3 annuity-model.py
```
![Spreadsheet loaded with output from Python - 3-cohorts.](../annuity-model/demo/pictures/Annuity_model_python_all_cohorts_embedded.png)

#### Running first cohort only and specifying output filename
  ```bash
python3 annuity-model.py --index cohort=1 --csv annuity_model_out_cohort1_embedded.csv
```

![Spreadsheet loaded with output from Python - table of projected ages etc.](../annuity-model/demo/pictures/Annuity_model_python_cohort1_embedded.png)

### Run with actual inputs
See [annuity model demo](../annuity-model/demo).


### Static chart (Lorenz)

```bash
python3 lorenz.py --steps 60000 --plot-static --plot-vars "lorenz:x,y,z" --gif lorenz60000_static.gif
```

![Snapshot of a numerical integration of Lorenz equations output by Python rendering.](../rocket-model/lorenz60000_static.gif)

### Animated chart (spacecraft)

```bash
python3 rocket_with_thrust.py   --steps 60000   --plot-traj   --plot-vars "rocket:x,y;moon:moon_x,moon_y"   --plot-t tau   --plot-title day --plot-head-colors "rocket=red,moon=silver" --plot-tail-colors "rocket=blue,moon=dimgray"  --plot-step 10   --fps 30   --gif rocket60000.gif
```

![Snapshot of a numerical integration of Lorenz equations output by Python rendering.](../rocket-model/rocket60000.gif)


